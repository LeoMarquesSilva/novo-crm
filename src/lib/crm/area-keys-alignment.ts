/**
 * Normaliza valores **legados** de `app_users.area` / `areas_analise` para as chaves
 * canônicas em `CRM_PRACTICE_AREAS`. Novos registros devem usar sempre a lista única (`crm-areas.ts`).
 */

/** Formato antigo (sem acentos / label curto) → valor canónico actual. */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  Civel: "Cível",
  Tributario: "Tributário",
  "Societario e Contratos": "Societário e Contratos",
  Reestruturacao: "Reestruturação e Insolvência",
};

/** Converte texto de área (perfil ou BD antiga) para a chave usada no escopo / solicitações. */
export function normalizePracticeAreaKey(raw: string): string {
  const t = raw.trim();
  return LEGACY_TO_CANONICAL[t] ?? t;
}

/**
 * Converte a área do perfil para a chave no JSON de escopo (canónica).
 */
export function appUserAreaToEscopoJsonKey(appArea: string): string {
  return normalizePracticeAreaKey(appArea);
}

/** @deprecated usar `normalizePracticeAreaKey`; mantido por compat. */
export function escopoJsonKeyToPrimaryAppUserArea(scopeKey: string): string {
  return normalizePracticeAreaKey(scopeKey);
}

/**
 * Valores em `app_users.area` a considerar ao resolver gestor para uma `area_key` de solicitação
 * (inclui legados que mapeiam para a mesma área).
 */
export function appUserAreaCandidatesForScopeKey(scopeAreaKey: string): string[] {
  const s = scopeAreaKey.trim();
  const canonical = normalizePracticeAreaKey(s);
  const set = new Set<string>([s, canonical]);
  for (const [legacy, c] of Object.entries(LEGACY_TO_CANONICAL)) {
    if (c === canonical) set.add(legacy);
  }
  return [...set];
}

/** Compara área de perfil com chave de escopo (aceita legado num dos lados). */
export function appUserAreaMatchesScopeKey(appUserArea: string, scopeAreaKey: string): boolean {
  return normalizePracticeAreaKey(appUserArea) === normalizePracticeAreaKey(scopeAreaKey);
}
