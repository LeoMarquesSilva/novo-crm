export const SIDEBAR_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  "/crm/documentos": "/crm/due-diligence",
  "/crm/admin/documentos": "/crm/admin/modelo-proposta",
};

export function normalizeSidebarFavoriteHrefs(values: string[]): string[] {
  return [
    ...new Set(values.map((href) => SIDEBAR_ROUTE_ALIASES[href] ?? href)),
  ];
}
