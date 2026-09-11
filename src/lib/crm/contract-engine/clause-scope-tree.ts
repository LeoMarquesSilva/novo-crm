import { CRM_PRACTICE_AREAS, type CrmPracticeArea } from "@/lib/crm/crm-areas";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { getObjectTemplate, type ContractObjectTemplate } from "./object-catalog";
import { getScopeProfile } from "./scope-profiles";
import type { ContractScopeProfile } from "./types";

/** Linha mínima necessária para agrupar cláusulas na árvore Área → Tipo → Subtipo. */
export type ClauseTreeRow = {
  area_key?: string | null;
  scope_subtype_key?: string | null;
};

export type ClauseScopeSubtypeNode<T extends ClauseTreeRow> = {
  subtypeKey: string;
  subtypeLabel: string;
  profile: ContractScopeProfile | null;
  clauses: T[];
  objectTemplates: ContractObjectTemplate[];
};

export type ClauseScopeTypeNode<T extends ClauseTreeRow> = {
  typeKey: string;
  typeLabel: string;
  subtypes: ClauseScopeSubtypeNode<T>[];
};

export type ClauseScopeAreaNode<T extends ClauseTreeRow> = {
  areaKey: CrmPracticeArea;
  types: ClauseScopeTypeNode<T>[];
  /** Cláusulas da área inteira, não amarradas a um subtipo específico (ex.: exclusões cruzadas). */
  areaWideClauses: T[];
};

export type ClauseScopeTree<T extends ClauseTreeRow> = {
  areas: ClauseScopeAreaNode<T>[];
  /** Cláusulas transversais, válidas para qualquer área/contrato (ex.: PADRÃO BP, PAGAMENTO). */
  transversalClauses: T[];
};

function objectTemplatesForProfile(profile: ContractScopeProfile | null): ContractObjectTemplate[] {
  if (!profile) return [];
  return profile.objectDefinition.objectBlockKeys
    .map((key) => getObjectTemplate(key))
    .filter((t): t is ContractObjectTemplate => Boolean(t))
    .sort((a, b) => a.order - b.order);
}

/** Organiza cláusulas (do banco) na mesma árvore Área → Tipo → Subtipo do catálogo de propostas. */
export function buildClauseScopeTree<T extends ClauseTreeRow>(params: {
  catalog: PropostaTiposCatalog;
  clauses: T[];
}): ClauseScopeTree<T> {
  const { catalog, clauses } = params;

  const areas: ClauseScopeAreaNode<T>[] = CRM_PRACTICE_AREAS.map((areaKey) => {
    const tipos = catalog[areaKey] ?? [];
    const types: ClauseScopeTypeNode<T>[] = tipos.map((tipo) => ({
      typeKey: tipo.tipoId,
      typeLabel: tipo.label,
      subtypes: tipo.subtipos.map((subtipo) => {
        const profile = getScopeProfile(subtipo.subtipoId) ?? null;
        return {
          subtypeKey: subtipo.subtipoId,
          subtypeLabel: subtipo.label,
          profile,
          clauses: clauses.filter((c) => c.scope_subtype_key === subtipo.subtipoId),
          objectTemplates: objectTemplatesForProfile(profile),
        };
      }),
    }));

    return {
      areaKey,
      types,
      areaWideClauses: clauses.filter((c) => c.area_key === areaKey && !c.scope_subtype_key),
    };
  });

  return {
    areas,
    transversalClauses: clauses.filter((c) => !c.area_key),
  };
}
