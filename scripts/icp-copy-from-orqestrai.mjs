/**
 * Cópia única dos dados do ICP do ORQESTRAI para o CRM, feita quando o módulo mudou de casa:
 * - icp_cnpj_cadastro (cadastro da Receita; o cron do CRM refaria, mas 250 CNPJs por semana);
 * - icp_group_profiles (LinkedIn; não dá para refazer: a lista de páginas foi montada à mão);
 * - logos: bucket MARKETING-SYSTEM-PROJETOS/icp-logos/* do ORQESTRAI → bucket icp-logos do CRM
 *   (logo_path perde o prefixo "icp-logos/").
 *
 * Idempotente (upsert pela chave). Rode depois de aplicar a migration
 * 20261013120000_icp_cnpj_cadastro_group_profiles no projeto do CRM.
 *
 * Uso:
 *   DRY_RUN=1 node scripts/icp-copy-from-orqestrai.mjs   só conta o que copiaria
 *   node scripts/icp-copy-from-orqestrai.mjs             copia
 *
 * Variáveis (.env.local / .env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (CRM),
 * ORQESTRAI_SUPABASE_URL, ORQESTRAI_SUPABASE_SERVICE_ROLE_KEY (origem).
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const DRY_RUN = process.env.DRY_RUN === "1";
const PAGE_SIZE = 1000;
const BATCH_SIZE = 500;
const SOURCE_BUCKET = "MARKETING-SYSTEM-PROJETOS";
const SOURCE_PREFIX = "icp-logos/";
const TARGET_BUCKET = "icp-logos";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

const crmUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const orqUrl = requireEnv("ORQESTRAI_SUPABASE_URL");
if (crmUrl.replace(/\/$/, "") === orqUrl.replace(/\/$/, "")) {
  throw new Error("Origem e destino são o mesmo projeto Supabase: confira as variáveis.");
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const crm = createClient(crmUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), options);
const orq = createClient(orqUrl, requireEnv("ORQESTRAI_SUPABASE_SERVICE_ROLE_KEY"), options);

async function readAll(client, table, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(orderBy)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function upsertInBatches(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await crm.from(table).upsert(rows.slice(i, i + BATCH_SIZE), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function copyLogo(sourcePath) {
  const targetPath = sourcePath.startsWith(SOURCE_PREFIX) ? sourcePath.slice(SOURCE_PREFIX.length) : sourcePath;
  if (DRY_RUN) return targetPath;
  const { data, error } = await orq.storage.from(SOURCE_BUCKET).download(sourcePath);
  if (error || !data) throw new Error(`logo ${sourcePath}: ${error?.message ?? "não encontrado"}`);
  const { error: uploadError } = await crm.storage
    .from(TARGET_BUCKET)
    .upload(targetPath, Buffer.from(await data.arrayBuffer()), {
      contentType: data.type || undefined,
      upsert: true,
      cacheControl: "86400",
    });
  if (uploadError) throw new Error(`logo ${targetPath}: ${uploadError.message}`);
  return targetPath;
}

async function main() {
  console.log(`ORQESTRAI → CRM${DRY_RUN ? " (DRY_RUN: nada é gravado)" : ""}`);

  const cadastro = await readAll(orq, "icp_cnpj_cadastro", "cnpj");
  console.log(`icp_cnpj_cadastro: ${cadastro.length} linhas`);
  if (!DRY_RUN) await upsertInBatches("icp_cnpj_cadastro", cadastro, "cnpj");

  const profiles = await readAll(orq, "icp_group_profiles", "grupo");
  const withLogo = profiles.filter((p) => p.logo_path);
  console.log(`icp_group_profiles: ${profiles.length} linhas, ${withLogo.length} com logo`);

  const copied = [];
  let logoErrors = 0;
  for (const profile of profiles) {
    let logoPath = profile.logo_path;
    if (logoPath) {
      try {
        logoPath = await copyLogo(logoPath);
      } catch (err) {
        logoErrors++;
        console.warn(`  ! ${profile.grupo}: ${err instanceof Error ? err.message : err}`);
        logoPath = null;
      }
    }
    copied.push({ ...profile, logo_path: logoPath, logo_source: logoPath ? profile.logo_source : null });
  }
  if (!DRY_RUN) await upsertInBatches("icp_group_profiles", copied, "grupo");

  console.log(
    `Concluído: ${cadastro.length} CNPJs, ${profiles.length} perfis, ${withLogo.length - logoErrors} logos` +
      (logoErrors ? ` (${logoErrors} logos com erro, gravados sem logo)` : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
