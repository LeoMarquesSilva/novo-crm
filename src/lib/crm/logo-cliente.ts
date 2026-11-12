import { normalizeGroupKey } from "@/lib/crm/normalize-document";

/**
 * Logo dos clientes da carteira (12/11/2026): é a mesma logo do grupo econômico que o ICP mostra,
 * gravada pelo `scripts/icp-linkedin-sync.mjs` em `icp_group_profiles.logo_path` com o arquivo no
 * bucket público `icp-logos`. A regra da URL é a do ICP (`icp-data-loader.ts`, `toProfile`), copiada
 * aqui para as telas do CRM não dependerem do módulo do ICP.
 *
 * A ligação com o CRM é pelo nome do grupo: `icp_group_profiles.grupo` é o nome do grupo no VIOS
 * (`grupo_cliente`), o mesmo que o OrquestrAI espelha em `grupos_economicos.nome`. A comparação usa
 * `normalizeGroupKey` (sem acento, minúsculo, só letras e números), a mesma da `chave_estavel`.
 */
export const ICP_LOGO_BUCKET = "icp-logos";

export type PerfilLogoIcp = {
  grupo: string;
  logo_path: string | null;
  updated_at: string | null;
};

/**
 * URL pública da logo no storage do Supabase. O arquivo é regravado no mesmo caminho quando a logo
 * muda, por isso `?v=` leva a data da última gravação (sem ela, o navegador mostraria a antiga).
 * Sem caminho ou sem a URL do Supabase, não há logo.
 */
export function urlDaLogoIcp(
  supabaseUrl: string | null | undefined,
  perfil: Pick<PerfilLogoIcp, "logo_path" | "updated_at">,
): string | null {
  const base = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const path = (perfil.logo_path ?? "").trim().replace(/^\/+/, "");
  if (!base || !path) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${base}/storage/v1/object/public/${ICP_LOGO_BUCKET}/${encodedPath}`;
  const version = perfil.updated_at ? Date.parse(perfil.updated_at) : Number.NaN;
  return Number.isFinite(version) ? `${url}?v=${version}` : url;
}

/** Logos por nome normalizado do grupo; perfis sem logo ficam de fora. */
export function indexarLogosPorGrupo(
  supabaseUrl: string | null | undefined,
  perfis: PerfilLogoIcp[],
): Map<string, string> {
  const logos = new Map<string, string>();
  for (const perfil of perfis) {
    const key = normalizeGroupKey(perfil.grupo);
    const url = urlDaLogoIcp(supabaseUrl, perfil);
    if (key && url && !logos.has(key)) logos.set(key, url);
  }
  return logos;
}

/** Logo do grupo pelo nome (`grupos_economicos.nome`), ou `null`. */
export function logoDoGrupo(logos: Map<string, string>, nomeDoGrupo: string | null | undefined): string | null {
  const key = normalizeGroupKey(nomeDoGrupo);
  return key ? (logos.get(key) ?? null) : null;
}

/** Palavras que não entram nas iniciais: "Grupo", conectivos e a forma societária. */
const PALAVRAS_SEM_INICIAL = new Set([
  "grupo",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "ltda",
  "sa",
  "me",
  "epp",
  "eireli",
  "mei",
  "cia",
  "slu",
]);

/**
 * Iniciais do cliente para quando não há logo: duas palavras significativas ("Grupo Longitude" → "L",
 * "ACME Indústria e Comércio Ltda" → "AI"). Sem nada aproveitável, a primeira letra ou "?".
 */
export function iniciaisDoCliente(nome: string | null | undefined, max = 2): string {
  const texto = (nome ?? "").trim();
  const palavras = texto
    .replace(/\bS\s*[./]\s*A\b\.?/gi, " ")
    // Qualquer sinal separa palavras ("[TESTE] ACME", "A&B"); o apóstrofo fica ("D'Ávila").
    .split(/[^\p{L}\d']+/u)
    .filter((palavra) => /^[\p{L}\d]/u.test(palavra))
    .filter((palavra) => !PALAVRAS_SEM_INICIAL.has(normalizeGroupKey(palavra)));
  const iniciais = palavras
    .slice(0, Math.max(1, max))
    .map((palavra) => palavra[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  if (iniciais) return iniciais;
  const primeira = texto.match(/[\p{L}\d]/u)?.[0];
  return primeira ? primeira.toLocaleUpperCase("pt-BR") : "?";
}
