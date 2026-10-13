/**
 * Porte (colaboradores) e logo dos grupos de clientes do ICP, pela página pública da empresa
 * no LinkedIn. Grava em icp_group_profiles e sobe o logo para o bucket icp-logos (projeto
 * Supabase do CRM). Veio do ORQESTRAI junto com o módulo ICP.
 *
 * Uso:
 *   node scripts/icp-linkedin-sync.mjs <arquivo.json>   carrega uma lista de grupos e páginas
 *   node scripts/icp-linkedin-sync.mjs                  renova os grupos já encontrados
 *   DRY_RUN=1 node scripts/icp-linkedin-sync.mjs ...    só mostra o que gravaria
 *
 * O arquivo é uma lista de { grupo, linkedinUrl, confidence, website, note, logoUrl? }.
 * linkedinUrl nulo grava o grupo como não encontrado e tenta o logo pelo site, quando houver;
 * logoUrl força a imagem do logo (por exemplo, a marca do grupo numa página de outra unidade).
 * Roda na máquina local: o LinkedIn não entrega a página pública para IPs de servidor.
 */

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const DRY_RUN = process.env.DRY_RUN === "1";
const BUCKET = "icp-logos";
/** Pausa entre páginas do LinkedIn, para não ser bloqueado. */
const DELAY_MS = 2500;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Valor de um item do "Sobre" da página (data-test-id="about-us__size" etc.). */
function aboutField(html, id) {
  const start = html.indexOf(`data-test-id="${id}"`);
  if (start < 0) return null;
  const end = html.indexOf("</div>", start);
  const dd = html.slice(start, end > 0 ? end : start + 1500).match(/<dd[^>]*>([\s\S]*?)<\/dd>/);
  return dd ? decode(dd[1]) || null : null;
}

/** "201-500 funcionários" → { range: "201-500", min: 201, max: 500 }; "10.001+ funcionários" → max nulo. */
function parseEmployeeRange(raw) {
  if (!raw) return null;
  const digits = (s) => Number(s.replace(/\D/g, ""));
  const between = raw.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (between) return { range: `${between[1]}-${between[2]}`, min: digits(between[1]), max: digits(between[2]) };
  const plus = raw.match(/([\d.]+)\s*\+/);
  if (plus) return { range: `${plus[1]}+`, min: digits(plus[1]), max: null };
  const single = raw.match(/^([\d.]+)\s/);
  if (single) return { range: single[1], min: digits(single[1]), max: digits(single[1]) };
  return null;
}

function linkedinSlug(url) {
  return url?.match(/linkedin\.com\/company\/([^/?#]+)/i)?.[1] ?? null;
}

/** Página pública da empresa. null quando a página não existe; "blocked" quando o LinkedIn recusou. */
async function fetchLinkedin(url) {
  const slug = linkedinSlug(url);
  if (!slug) return null;
  const res = await fetch(`https://www.linkedin.com/company/${slug}`, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
  });
  if (res.status === 404) return null;
  const html = await res.text();
  if (res.status !== 200 || /authwall|uas\/login/.test(res.url)) return "blocked";

  let org = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const json = JSON.parse(m[1]);
      org = (json["@graph"] ?? [json]).find((n) => n["@type"] === "Organization") ?? org;
    } catch {
      // bloco com JSON inválido: ignora
    }
  }
  const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
  const website = aboutField(html, "about-us__website")?.split(" ")[0] ?? null;
  return {
    url: `https://www.linkedin.com/company/${slug}`,
    name: org?.name ?? null,
    size: parseEmployeeRange(aboutField(html, "about-us__size")),
    members: org?.numberOfEmployees?.value ?? null,
    industry: aboutField(html, "about-us__industry"),
    headquarters: aboutField(html, "about-us__headquarters"),
    website,
    logo: /company-logo/.test(ogImage ?? "") ? ogImage : (org?.logo?.contentUrl ?? null),
  };
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !type.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Ícone de 1 KB ou menos costuma ser o favicon genérico.
    return buffer.length > 1024 ? { buffer, type } : null;
  } catch {
    return null;
  }
}

/** Logo pelo site: apple-touch-icon ou ícone grande declarado no HTML; depois o favicon do Google. */
async function siteLogo(website) {
  let origin;
  try {
    origin = new URL(/^https?:\/\//.test(website) ? website : `https://${website}`).origin;
  } catch {
    return null;
  }
  try {
    const res = await fetch(origin, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const html = await res.text();
    const icons = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => /rel=["'][^"']*(apple-touch-icon|icon)[^"']*["']/i.test(tag))
      .map((tag) => ({
        href: tag.match(/href=["']([^"']+)["']/i)?.[1],
        size: Number(tag.match(/sizes=["'](\d+)x\d+["']/i)?.[1] ?? (/apple-touch-icon/i.test(tag) ? 180 : 0)),
      }))
      // Ícone sem "sizes" entra por último; downloadImage descarta os pequenos demais.
      .filter((i) => i.href && (i.size >= 96 || i.size === 0))
      .sort((a, b) => b.size - a.size);
    for (const icon of icons) {
      const image = await downloadImage(new URL(icon.href, res.url).href);
      if (image) return image;
    }
  } catch {
    // site fora do ar: tenta o favicon do Google
  }
  return downloadImage(`https://www.google.com/s2/favicons?domain=${new URL(origin).hostname}&sz=128`);
}

function logoPath(grupo, type) {
  const slug = grupo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = { "image/png": "png", "image/svg+xml": "svg", "image/webp": "webp", "image/gif": "gif" }[type] ?? "jpg";
  return `${slug}.${ext}`;
}

async function uploadLogo(grupo, image) {
  const path = logoPath(grupo, image.type);
  if (DRY_RUN) return path;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, image.buffer, { contentType: image.type, upsert: true, cacheControl: "86400" });
  if (error) throw new Error(`logo de ${grupo}: ${error.message}`);
  return path;
}

async function syncOne(item, previous) {
  const now = new Date().toISOString();
  const page = item.linkedinUrl ? await fetchLinkedin(item.linkedinUrl) : null;
  if (page === "blocked") return { grupo: item.grupo, skipped: "LinkedIn recusou a página; mantido o que havia" };

  const website = item.website || page?.website || previous?.website || null;
  let logo = null;
  let logoSource = null;
  if (item.logoUrl) {
    logo = await downloadImage(item.logoUrl);
    logoSource = logo ? (/licdn\.com/.test(item.logoUrl) ? "linkedin" : "site") : null;
  }
  if (!logo && page?.logo) {
    logo = await downloadImage(page.logo);
    logoSource = logo ? "linkedin" : null;
  }
  if (!logo && website) {
    logo = await siteLogo(website);
    logoSource = logo ? "site" : null;
  }

  const row = {
    grupo: item.grupo,
    status: page ? "found" : "not_found",
    match_confidence: page ? (item.confidence ?? previous?.match_confidence ?? null) : null,
    linkedin_url: page?.url ?? null,
    linkedin_name: page?.name ?? null,
    employee_range: page?.size?.range ?? null,
    employee_min: page?.size?.min ?? null,
    employee_max: page?.size?.max ?? null,
    linkedin_members: page?.members ?? null,
    industry: page?.industry ?? null,
    headquarters: page?.headquarters ?? null,
    website,
    logo_path: logo ? await uploadLogo(item.grupo, logo) : (previous?.logo_path ?? null),
    logo_source: logo ? logoSource : (previous?.logo_source ?? null),
    note: item.note ?? previous?.note ?? null,
    fetched_at: page ? now : null,
    updated_at: now,
  };
  if (!DRY_RUN) {
    const { error } = await supabase.from("icp_group_profiles").upsert(row, { onConflict: "grupo" });
    if (error) throw new Error(`${item.grupo}: ${error.message}`);
  }
  return row;
}

async function main() {
  const { data: existing, error } = await supabase.from("icp_group_profiles").select("*");
  if (error) throw new Error(error.message);
  const previousByGroup = new Map((existing ?? []).map((r) => [r.grupo, r]));

  const file = process.argv[2];
  const items = file
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : (existing ?? [])
        .filter((r) => r.status === "found" && r.linkedin_url)
        .map((r) => ({ grupo: r.grupo, linkedinUrl: r.linkedin_url, confidence: r.match_confidence, website: r.website, note: r.note }));

  console.log(`${items.length} grupos${DRY_RUN ? " (DRY_RUN)" : ""}`);
  const totals = { found: 0, notFound: 0, skipped: 0, logos: 0 };
  for (const item of items) {
    const row = await syncOne(item, previousByGroup.get(item.grupo));
    if (row.skipped) {
      totals.skipped++;
      console.log(`  ! ${row.grupo}: ${row.skipped}`);
    } else {
      if (row.status === "found") totals.found++;
      else totals.notFound++;
      if (row.logo_path) totals.logos++;
      console.log(
        `  ${row.status === "found" ? "✓" : "·"} ${row.grupo}: ${row.employee_range ?? "sem faixa"}` +
          `${row.linkedin_members != null ? ` (${row.linkedin_members} no LinkedIn)` : ""}` +
          `${row.logo_path ? ` · logo ${row.logo_source}` : ""}`
      );
    }
    if (item.linkedinUrl) await sleep(DELAY_MS);
  }
  console.log(
    `Encontrados: ${totals.found} · não encontrados: ${totals.notFound} · com logo: ${totals.logos} · mantidos: ${totals.skipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
