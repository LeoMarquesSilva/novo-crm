import { normalizeGroupKey } from "@/lib/crm/normalize-document";

/**
 * Categoria da linha em `/crm/clientes`: **Cliente** ou **Lead**.
 * Não é área jurídica (`responsible_area` / Cível / Trabalhista ficam em Áreas).
 *
 * `grupos_economicos` atuais são sempre Cliente. Leads entram depois pela mesma
 * lista com `origemLinha: "lead"` (oportunidade com empresa/grupo, sem regra de funil).
 * A coluna `grupos_economicos.categoria` passou a persistir esse rótulo (`Cliente` |
 * `Lead`), não mais `email_client_groups.responsible_area`.
 */
export const CARTEIRA_ORIGEM_LINHA = ["cliente", "lead"] as const;
export type CarteiraOrigemLinha = (typeof CARTEIRA_ORIGEM_LINHA)[number];

export const CARTEIRA_CATEGORIA_LABEL: Record<CarteiraOrigemLinha, string> = {
  cliente: "Cliente",
  lead: "Lead",
};

export const CARTEIRA_CATEGORIA_BADGE_CLASS: Record<CarteiraOrigemLinha, string> = {
  cliente: "border-info-border bg-info-bg text-info-text",
  lead: "border-violet-border bg-violet-bg text-violet-text",
};

export const GRUPO_CATEGORIA_CLIENTE = CARTEIRA_CATEGORIA_LABEL.cliente;
export const GRUPO_CATEGORIA_LEAD = CARTEIRA_CATEGORIA_LABEL.lead;

export function persistCarteiraCategoria(origem: CarteiraOrigemLinha): string {
  return CARTEIRA_CATEGORIA_LABEL[origem];
}

export function origemLinhaForGrupoEconomico(): CarteiraOrigemLinha {
  return "cliente";
}

/** Caminho para união com oportunidades: linha de lead, sem etapa de funil. */
export function origemLinhaForOportunidade(): CarteiraOrigemLinha {
  return "lead";
}

export function parseCarteiraOrigemLinha(
  value: string | null | undefined,
): CarteiraOrigemLinha | null {
  const raw = (value ?? "").trim().toLocaleLowerCase("pt-BR");
  if (raw === "cliente") return "cliente";
  if (raw === "lead") return "lead";
  return null;
}

/**
 * Grupos da carteira são Cliente. Texto legado de área (Cível etc.) na coluna
 * `categoria` não vira Categoria — trata-se como Cliente.
 */
export function origemLinhaFromGrupoCategoria(
  value: string | null | undefined,
): CarteiraOrigemLinha {
  return parseCarteiraOrigemLinha(value) ?? origemLinhaForGrupoEconomico();
}

/** Texto legado de área na coluna `categoria` ainda pode alimentar Áreas até o próximo sync. */
export function legacyCategoriaAsResponsibleArea(
  value: string | null | undefined,
): string | null {
  if (parseCarteiraOrigemLinha(value)) return null;
  const raw = (value ?? "").trim();
  return raw || null;
}

export type ClienteResponsibleAreaIndex = {
  byOrqestraiId: Map<string, string>;
  byGroupKey: Map<string, string>;
};

export function buildClienteResponsibleAreaIndex(
  groups: Array<{
    id: string;
    name: string;
    nameNormalized?: string | null;
    responsibleArea: string | null;
  }>,
): ClienteResponsibleAreaIndex {
  const byOrqestraiId = new Map<string, string>();
  const byGroupKey = new Map<string, string>();
  for (const group of groups) {
    const area = (group.responsibleArea ?? "").trim();
    if (!area) continue;
    byOrqestraiId.set(group.id, area);
    const key = normalizeGroupKey(group.nameNormalized || group.name);
    if (!key) continue;
    if (!byGroupKey.has(key)) byGroupKey.set(key, area);
  }
  return { byOrqestraiId, byGroupKey };
}

export function lookupClienteResponsibleArea(
  index: ClienteResponsibleAreaIndex,
  input: { orqestraiId?: string | null; groupKey?: string | null },
): string | null {
  if (input.orqestraiId) {
    const byId = index.byOrqestraiId.get(input.orqestraiId);
    if (byId) return byId;
  }
  if (input.groupKey) {
    return index.byGroupKey.get(input.groupKey) ?? null;
  }
  return null;
}
