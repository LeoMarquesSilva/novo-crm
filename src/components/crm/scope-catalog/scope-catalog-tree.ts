import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";

export type ScopeTreeGroup = {
  key: string;
  label: string;
  hideLabel?: boolean;
  items: ScopeTreeItem[];
};

export type ScopeTreeItem = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  subtypes: ScopeTreeSubtype[];
};

export type ScopeTreeSubtype = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  parentBreadcrumb: string[];
};

const locale = "pt-BR";

function compareBySortThenLabel(
  a: { sortOrder: number; label: string },
  b: { sortOrder: number; label: string },
): number {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, locale);
}

export function buildScopeTree(data: ProposalCatalogAdminData): ScopeTreeGroup[] {
  const typeById = new Map(data.adminRows.scopeTypes.map((t) => [t.id, t]));
  const groups = new Map<string, ScopeTreeGroup>();

  for (const t of data.adminRows.scopeTypes) {
    if (!groups.has(t.areaKey)) {
      groups.set(t.areaKey, { key: t.areaKey, label: t.areaKey, items: [] });
    }
    const g = groups.get(t.areaKey)!;
    g.items.push({
      key: t.id,
      label: t.label,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      subtypes: [],
    });
  }

  for (const s of data.adminRows.scopeSubtypes) {
    const parentType = typeById.get(s.scopeTypeId);
    if (!parentType) continue;
    const g = groups.get(parentType.areaKey);
    if (!g) continue;
    const item = g.items.find((i) => i.key === parentType.id);
    if (!item) continue;
    item.subtypes.push({
      key: s.id,
      label: s.label,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      parentBreadcrumb: [g.label, item.label],
    });
  }

  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label, locale))
    .map((g) => ({
      ...g,
      items: g.items
        .sort(compareBySortThenLabel)
        .map((i) => ({
          ...i,
          subtypes: [...i.subtypes].sort(compareBySortThenLabel),
        })),
    }));
}

export function buildInvestmentTree(data: ProposalCatalogAdminData): ScopeTreeGroup[] {
  const items = data.adminRows.investmentTypes.map((t) => ({
    key: t.id,
    label: t.label,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    subtypes: data.adminRows.investmentSubtypes
      .filter((s) => s.investmentTypeId === t.id)
      .map((s) => ({
        key: s.id,
        label: s.label,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        parentBreadcrumb: [t.label],
      }))
      .sort(compareBySortThenLabel),
  }));

  return [
    {
      key: "__investments__",
      label: "",
      hideLabel: true,
      items: items.sort(compareBySortThenLabel),
    },
  ];
}

export function filterScopeTree(groups: ScopeTreeGroup[], query: string): ScopeTreeGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  const out: ScopeTreeGroup[] = [];
  for (const g of groups) {
    const items: ScopeTreeItem[] = [];
    for (const it of g.items) {
      const subMatches = it.subtypes.filter((s) => s.label.toLowerCase().includes(q));
      const itMatches = it.label.toLowerCase().includes(q);
      const groupMatches = g.label.toLowerCase().includes(q);
      if (itMatches || subMatches.length > 0 || groupMatches) {
        items.push({
          ...it,
          subtypes: itMatches || groupMatches ? it.subtypes : subMatches,
        });
      }
    }
    if (items.length > 0 || g.label.toLowerCase().includes(q)) {
      out.push({ ...g, items });
    }
  }
  return out;
}

export type CatalogCreateKind =
  | { type: "scope_type" }
  | { type: "scope_subtype"; scopeTypeId: string }
  | { type: "investment_type" }
  | { type: "investment_subtype"; investmentTypeId: string };

export function findCreatedId(
  prev: ProposalCatalogAdminData,
  next: ProposalCatalogAdminData,
  kind: CatalogCreateKind,
): string | null {
  switch (kind.type) {
    case "scope_type": {
      const prevIds = new Set(prev.adminRows.scopeTypes.map((t) => t.id));
      return next.adminRows.scopeTypes.find((t) => !prevIds.has(t.id))?.id ?? null;
    }
    case "scope_subtype": {
      const prevIds = new Set(prev.adminRows.scopeSubtypes.map((s) => s.id));
      return (
        next.adminRows.scopeSubtypes
          .filter((s) => s.scopeTypeId === kind.scopeTypeId)
          .find((s) => !prevIds.has(s.id))?.id ?? null
      );
    }
    case "investment_type": {
      const prevIds = new Set(prev.adminRows.investmentTypes.map((t) => t.id));
      return next.adminRows.investmentTypes.find((t) => !prevIds.has(t.id))?.id ?? null;
    }
    case "investment_subtype": {
      const prevIds = new Set(prev.adminRows.investmentSubtypes.map((s) => s.id));
      return (
        next.adminRows.investmentSubtypes
          .filter((s) => s.investmentTypeId === kind.investmentTypeId)
          .find((s) => !prevIds.has(s.id))?.id ?? null
      );
    }
  }
}

export function selectionStillValid(
  selection: { level: "type" | "subtype"; typeId?: string; subtypeId?: string } | null,
  data: ProposalCatalogAdminData,
  tab: "scope" | "investment",
): boolean {
  if (!selection) return true;

  if (selection.level === "type") {
    if (!selection.typeId) return false;
    if (tab === "scope") {
      return data.adminRows.scopeTypes.some((t) => t.id === selection.typeId);
    }
    return data.adminRows.investmentTypes.some((t) => t.id === selection.typeId);
  }

  if (!selection.subtypeId) return false;
  if (tab === "scope") {
    return data.adminRows.scopeSubtypes.some((s) => s.id === selection.subtypeId);
  }
  return data.adminRows.investmentSubtypes.some((s) => s.id === selection.subtypeId);
}
