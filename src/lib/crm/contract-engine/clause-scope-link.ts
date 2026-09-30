import { getScopeProfile } from "./scope-profiles";

/** Linha mínima de `contract_clause_templates` para medir o vínculo com um subtipo de escopo. */
export type ClauseScopeLinkRow = {
  area_key?: string | null;
  scope_subtype_key?: string | null;
  is_active: boolean;
};

export type SubtypeClauseCoverage = {
  /** Cláusulas com `scope_subtype_key` = subtipo (ativas e inativas). */
  linked: number;
  linkedActive: number;
  /** Cláusulas ativas da área inteira (`area_key` = área, sem subtipo). */
  areaWideActive: number;
  /** Cláusulas ativas transversais (sem área). */
  transversalActive: number;
  /** Há perfil de contrato em código (`scope-profiles.ts`) para este subtipo. */
  hasContractProfile: boolean;
};

export function summarizeSubtypeClauseCoverage(
  clauses: ClauseScopeLinkRow[],
  target: { areaKey: string; subtypeKey: string },
): SubtypeClauseCoverage {
  let linked = 0;
  let linkedActive = 0;
  let areaWideActive = 0;
  let transversalActive = 0;
  for (const clause of clauses) {
    if (clause.scope_subtype_key) {
      if (clause.scope_subtype_key !== target.subtypeKey) continue;
      linked += 1;
      if (clause.is_active) linkedActive += 1;
      continue;
    }
    if (!clause.is_active) continue;
    if (!clause.area_key) transversalActive += 1;
    else if (clause.area_key === target.areaKey) areaWideActive += 1;
  }
  return {
    linked,
    linkedActive,
    areaWideActive,
    transversalActive,
    hasContractProfile: Boolean(getScopeProfile(target.subtypeKey)),
  };
}

type SubtypeKeyRow = { id: string; scopeTypeId: string; subtypeKey: string; label: string };
type TypeRow = { id: string; areaKey: string; label: string };

/**
 * `subtype_key` só é único por tipo (`scope_type_id, subtype_key`), mas o vínculo das
 * cláusulas usa só a chave. Lista os outros subtipos que compartilham a chave, porque as
 * cláusulas vinculadas valem para todos eles.
 */
export function findSubtypeKeySiblings(
  subtypes: SubtypeKeyRow[],
  types: TypeRow[],
  subtypeId: string,
): Array<{ id: string; label: string; typeLabel: string; areaKey: string }> {
  const current = subtypes.find((s) => s.id === subtypeId);
  if (!current) return [];
  const typeById = new Map(types.map((t) => [t.id, t]));
  return subtypes
    .filter((s) => s.id !== subtypeId && s.subtypeKey === current.subtypeKey)
    .map((s) => {
      const type = typeById.get(s.scopeTypeId);
      return {
        id: s.id,
        label: s.label,
        typeLabel: type?.label ?? "",
        areaKey: type?.areaKey ?? "",
      };
    });
}
