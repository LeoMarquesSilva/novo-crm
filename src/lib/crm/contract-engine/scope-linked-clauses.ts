import type { ContractClauseTemplate, ContractScope } from "./types";

/**
 * Cláusulas ativas do banco vinculadas ao subtipo (`scope_subtype_key`). Quando a linha
 * tem `area_key`, precisa bater com a área da proposta — `subtype_key` só é único por tipo.
 * Ordem: `sort_order`, título, chave.
 */
export function linkedClausesForScope(
  library: Map<string, ContractClauseTemplate> | undefined,
  scope: Pick<ContractScope, "subtypeId" | "areaLabel">,
): ContractClauseTemplate[] {
  if (!library) return [];
  const area = scope.areaLabel.trim();
  return [...library.values()]
    .filter(
      (t) =>
        t.scopeLink?.subtypeKey === scope.subtypeId &&
        (t.scopeLink.areaKey == null || t.scopeLink.areaKey === area),
    )
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title, "pt-BR") ||
        a.stableKey.localeCompare(b.stableKey),
    );
}

/**
 * Subtipos sem perfil em código passam a ter as cláusulas vinculadas do banco. Só deixam
 * de ser `missingProfile` com ao menos uma cláusula ativa. Subtipos com perfil em código
 * não mudam.
 */
export function applyDatabaseLinkedClauses(
  scopes: ContractScope[],
  library: Map<string, ContractClauseTemplate> | undefined,
): ContractScope[] {
  return scopes.map((scope) => {
    if (scope.profile) return scope;
    const keys = linkedClausesForScope(library, scope).map((t) => t.stableKey);
    if (keys.length === 0) return scope;
    return { ...scope, missingProfile: false, linkedClauseKeys: keys };
  });
}
