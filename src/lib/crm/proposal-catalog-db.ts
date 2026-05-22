import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  PROPOSTA_TIPOS_CATALOG,
  type PropostaTiposCatalog,
  type TipoDef,
} from "@/data/proposta-tipos-catalog";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type { Database } from "@/lib/supabase/database.types";
export { findInvestmentSubtype, findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";

type ScopeTypeRow = Database["public"]["Tables"]["proposal_scope_types"]["Row"];
type ScopeSubtypeRow = Database["public"]["Tables"]["proposal_scope_subtypes"]["Row"];
type InvestmentTypeRow = Database["public"]["Tables"]["proposal_investment_types"]["Row"];
type InvestmentSubtypeRow = Database["public"]["Tables"]["proposal_investment_subtypes"]["Row"];

export type ProposalCatalogData = {
  scope: PropostaTiposCatalog;
  investment: InvestimentoTipoDef[];
  source: "database" | "fallback";
};

export type ProposalCatalogAdminData = ProposalCatalogData & {
  scopeTypeCount: number;
  scopeSubtypeCount: number;
  investmentTypeCount: number;
  investmentSubtypeCount: number;
  adminRows: {
    scopeTypes: Array<{
      id: string;
      areaKey: string;
      typeKey: string;
      label: string;
      sortOrder: number;
      isActive: boolean;
    }>;
    scopeSubtypes: Array<{
      id: string;
      scopeTypeId: string;
      subtypeKey: string;
      label: string;
      escopoTemplate: string;
      placeholderKeys: string[];
      sortOrder: number;
      isActive: boolean;
    }>;
    investmentTypes: Array<{
      id: string;
      typeKey: string;
      label: string;
      sortOrder: number;
      isActive: boolean;
    }>;
    investmentSubtypes: Array<{
      id: string;
      investmentTypeId: string;
      subtypeKey: string;
      label: string;
      conceito: string;
      template: string;
      placeholderKeys: string[];
      sortOrder: number;
      isActive: boolean;
    }>;
  };
};

export function fallbackProposalCatalog(): ProposalCatalogData {
  return {
    scope: PROPOSTA_TIPOS_CATALOG,
    investment: PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
    source: "fallback",
  };
}

export async function loadProposalCatalog(
  supabase = createSupabaseAdminClient(),
): Promise<ProposalCatalogData> {
  try {
    const [scopeTypesRes, scopeSubtypesRes, investmentTypesRes, investmentSubtypesRes] =
      await Promise.all([
        supabase
          .from("proposal_scope_types")
          .select("*")
          .order("area_key", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_scope_subtypes")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_investment_types")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_investment_subtypes")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      ]);

    if (scopeTypesRes.error || scopeSubtypesRes.error || investmentTypesRes.error || investmentSubtypesRes.error) {
      return fallbackProposalCatalog();
    }

    const scopeTypes = scopeTypesRes.data ?? [];
    const scopeSubtypes = scopeSubtypesRes.data ?? [];
    const investmentTypes = investmentTypesRes.data ?? [];
    const investmentSubtypes = investmentSubtypesRes.data ?? [];

    if (scopeTypes.length === 0 && investmentTypes.length === 0) {
      return fallbackProposalCatalog();
    }

    return {
      scope: mergeScopeCatalogWithFallback(scopeTypes, scopeSubtypes),
      investment: mergeInvestmentCatalogWithFallback(investmentTypes, investmentSubtypes),
      source: "database",
    };
  } catch {
    return fallbackProposalCatalog();
  }
}

export async function loadProposalCatalogAdmin(
  supabase = createSupabaseAdminClient(),
): Promise<ProposalCatalogAdminData> {
  const catalog = await loadProposalCatalog(supabase);
  const scopeTypeCount = Object.values(catalog.scope).reduce((sum, types) => sum + (types?.length ?? 0), 0);
  const scopeSubtypeCount = Object.values(catalog.scope).reduce(
    (sum, types) => sum + (types ?? []).reduce((inner, type) => inner + type.subtipos.length, 0),
    0,
  );
  const investmentTypeCount = catalog.investment.length;
  const investmentSubtypeCount = catalog.investment.reduce((sum, type) => sum + type.subtipos.length, 0);

  const adminRows = await loadAdminRows(supabase);

  return {
    ...catalog,
    scopeTypeCount,
    scopeSubtypeCount,
    investmentTypeCount,
    investmentSubtypeCount,
    adminRows,
  };
}

async function loadAdminRows(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  try {
    const [scopeTypesRes, scopeSubtypesRes, investmentTypesRes, investmentSubtypesRes] =
      await Promise.all([
        supabase
          .from("proposal_scope_types")
          .select("*")
          .order("area_key", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_scope_subtypes")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_investment_types")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("proposal_investment_subtypes")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      ]);

    if (scopeTypesRes.error || scopeSubtypesRes.error || investmentTypesRes.error || investmentSubtypesRes.error) {
      throw new Error("proposal catalog admin tables unavailable");
    }

    return {
      scopeTypes: (scopeTypesRes.data ?? []).map((row) => ({
        id: String(row.id),
        areaKey: String(row.area_key),
        typeKey: String(row.type_key),
        label: String(row.label),
        sortOrder: Number(row.sort_order ?? 0),
        isActive: Boolean(row.is_active),
      })),
      scopeSubtypes: (scopeSubtypesRes.data ?? []).map((row) => ({
        id: String(row.id),
        scopeTypeId: String(row.scope_type_id),
        subtypeKey: String(row.subtype_key),
        label: String(row.label),
        escopoTemplate: String(row.escopo_template ?? ""),
        placeholderKeys: Array.isArray(row.placeholder_keys) ? row.placeholder_keys.map(String) : [],
        sortOrder: Number(row.sort_order ?? 0),
        isActive: Boolean(row.is_active),
      })),
      investmentTypes: (investmentTypesRes.data ?? []).map((row) => ({
        id: String(row.id),
        typeKey: String(row.type_key),
        label: String(row.label),
        sortOrder: Number(row.sort_order ?? 0),
        isActive: Boolean(row.is_active),
      })),
      investmentSubtypes: (investmentSubtypesRes.data ?? []).map((row) => ({
        id: String(row.id),
        investmentTypeId: String(row.investment_type_id),
        subtypeKey: String(row.subtype_key),
        label: String(row.label),
        conceito: String(row.conceito ?? ""),
        template: String(row.template ?? ""),
        placeholderKeys: Array.isArray(row.placeholder_keys) ? row.placeholder_keys.map(String) : [],
        sortOrder: Number(row.sort_order ?? 0),
        isActive: Boolean(row.is_active),
      })),
    };
  } catch {
    return {
      scopeTypes: [],
      scopeSubtypes: [],
      investmentTypes: [],
      investmentSubtypes: [],
    };
  }
}

function mapScopeCatalog(
  types: ScopeTypeRow[],
  subtypes: ScopeSubtypeRow[],
): PropostaTiposCatalog {
  const byTypeId = new Map<string, ScopeSubtypeRow[]>();
  for (const subtype of subtypes) {
    const arr = byTypeId.get(String(subtype.scope_type_id)) ?? [];
    arr.push(subtype);
    byTypeId.set(String(subtype.scope_type_id), arr);
  }

  const out: Record<string, TipoDef[]> = {};
  for (const row of types) {
    const area = String(row.area_key);
    const current = out[area] ?? [];
    const type: TipoDef = {
      tipoId: String(row.type_key),
      label: String(row.label),
      subtipos: (byTypeId.get(String(row.id)) ?? []).map((subtype) => ({
        subtipoId: String(subtype.subtype_key),
        label: String(subtype.label),
        escopoTemplate: String(subtype.escopo_template ?? ""),
        placeholderKeys: Array.isArray(subtype.placeholder_keys)
          ? subtype.placeholder_keys.map(String)
          : [],
      })),
    };
    out[area] = [...current, type];
  }
  return out as PropostaTiposCatalog;
}

function mapInvestmentCatalog(
  types: InvestmentTypeRow[],
  subtypes: InvestmentSubtypeRow[],
): InvestimentoTipoDef[] {
  const byTypeId = new Map<string, InvestmentSubtypeRow[]>();
  for (const subtype of subtypes) {
    const arr = byTypeId.get(String(subtype.investment_type_id)) ?? [];
    arr.push(subtype);
    byTypeId.set(String(subtype.investment_type_id), arr);
  }

  return types.map((row) => ({
    tipoId: String(row.type_key),
    label: String(row.label),
    subtipos: (byTypeId.get(String(row.id)) ?? []).map((subtype) => ({
      subtipoId: String(subtype.subtype_key),
      label: String(subtype.label),
      conceito: String(subtype.conceito ?? ""),
      template: String(subtype.template ?? ""),
      placeholderKeys: Array.isArray(subtype.placeholder_keys)
        ? subtype.placeholder_keys.map(String)
        : [],
    })),
  }));
}

function mergeScopeCatalogWithFallback(
  types: ScopeTypeRow[],
  subtypes: ScopeSubtypeRow[],
): PropostaTiposCatalog {
  const activeCatalog = mapScopeCatalog(
    types.filter((row) => Boolean(row.is_active)),
    subtypes.filter((row) => Boolean(row.is_active)),
  );
  const configuredTypeKeys = new Set(types.map((row) => `${String(row.area_key)}:${String(row.type_key)}`));
  const configuredSubtypeKeys = new Set(
    subtypes.map((row) => `${String(row.scope_type_id)}:${String(row.subtype_key)}`),
  );
  const typeIdByAreaAndKey = new Map(types.map((row) => [`${String(row.area_key)}:${String(row.type_key)}`, String(row.id)]));

  const out: Record<string, TipoDef[]> = {};
  const areas = new Set([...Object.keys(PROPOSTA_TIPOS_CATALOG), ...Object.keys(activeCatalog)]);
  for (const area of areas) {
    const fallbackTypes = PROPOSTA_TIPOS_CATALOG[area as keyof PropostaTiposCatalog] ?? [];
    const activeTypes = activeCatalog[area as keyof PropostaTiposCatalog] ?? [];
    const activeByKey = new Map(activeTypes.map((type) => [type.tipoId, type]));
    const merged = fallbackTypes
      .filter((type) => !configuredTypeKeys.has(`${area}:${type.tipoId}`))
      .map((type) => ({ ...type, subtipos: [...type.subtipos] }));

    for (const type of activeTypes) {
      const fallbackType = fallbackTypes.find((item) => item.tipoId === type.tipoId);
      const dbTypeId = typeIdByAreaAndKey.get(`${area}:${type.tipoId}`);
      const fallbackSubtypes = fallbackType?.subtipos.filter(
        (subtype) => !dbTypeId || !configuredSubtypeKeys.has(`${dbTypeId}:${subtype.subtipoId}`),
      ) ?? [];
      activeByKey.set(type.tipoId, {
        ...type,
        subtipos: [...fallbackSubtypes, ...type.subtipos],
      });
    }

    const activeValues = [...activeByKey.values()];
    out[area] = [...merged, ...activeValues];
  }
  return out as PropostaTiposCatalog;
}

function mergeInvestmentCatalogWithFallback(
  types: InvestmentTypeRow[],
  subtypes: InvestmentSubtypeRow[],
): InvestimentoTipoDef[] {
  const activeCatalog = mapInvestmentCatalog(
    types.filter((row) => Boolean(row.is_active)),
    subtypes.filter((row) => Boolean(row.is_active)),
  );
  const configuredTypeKeys = new Set(types.map((row) => String(row.type_key)));
  const configuredSubtypeKeys = new Set(
    subtypes.map((row) => `${String(row.investment_type_id)}:${String(row.subtype_key)}`),
  );
  const typeIdByKey = new Map(types.map((row) => [String(row.type_key), String(row.id)]));
  const activeByKey = new Map(activeCatalog.map((type) => [type.tipoId, type]));

  const merged = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG
    .filter((type) => !configuredTypeKeys.has(type.tipoId))
    .map((type) => ({ ...type, subtipos: [...type.subtipos] }));

  for (const type of activeCatalog) {
    const fallbackType = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG.find((item) => item.tipoId === type.tipoId);
    const dbTypeId = typeIdByKey.get(type.tipoId);
    const fallbackSubtypes = fallbackType?.subtipos.filter(
      (subtype) => !dbTypeId || !configuredSubtypeKeys.has(`${dbTypeId}:${subtype.subtipoId}`),
    ) ?? [];
    activeByKey.set(type.tipoId, {
      ...type,
      subtipos: [...fallbackSubtypes, ...type.subtipos],
    });
  }

  return [...merged, ...activeByKey.values()];
}
