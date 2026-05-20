/**
 * Lista canónica de áreas de prática: cadastro inicial (`areas_analise`),
 * `cp_areas_objeto`, `cp_escopo_detalhe_json`, `proposta_escopo_solicitacao.area_key`
 * e opções de proposta (modal / Word).
 *
 * Manter uma única ordem e ortografia; `area-keys-alignment.ts` trata só valores legados em BD.
 */
export const CRM_PRACTICE_AREAS = [
  "Cível",
  "Trabalhista",
  "Societário e Contratos",
  "Recuperação de Créditos",
  "Tributário",
  "Reestruturação e Insolvência",
] as const;

export type CrmPracticeArea = (typeof CRM_PRACTICE_AREAS)[number];

/** Áreas só para perfil interno (não são linhas de escopo de proposta por área). */
export const CRM_PROFILE_ONLY_AREAS = [
  "Socio",
  "Distressed Deals",
  "Operacoes Legais",
  "Outro",
] as const;

/** Select de `app_users.area` (prática + funções internas). */
export const APP_USER_ALL_AREAS = [...CRM_PRACTICE_AREAS, ...CRM_PROFILE_ONLY_AREAS] as const;

export type AppUserSelectableArea = (typeof APP_USER_ALL_AREAS)[number];
