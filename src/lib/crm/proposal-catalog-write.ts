import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";
import { slugifyFieldCodeFromLabel } from "@/lib/crm/field-code";

type AdminClient = SupabaseClient<Database>;

export function cleanKey(value: string | undefined, label: string) {
  return (value?.trim() || slugifyFieldCodeFromLabel(label)).slice(0, 80);
}

export function cleanPlaceholders(explicit: string[] | undefined, ...texts: string[]) {
  const keys = explicit?.length ? explicit : extractPlaceholderKeysFromText(...texts);
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

export function insertScopeType(
  supabase: AdminClient,
  input: {
    areaKey: string;
    label: string;
    typeKey?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return supabase.from("proposal_scope_types").insert({
    area_key: input.areaKey.trim(),
    type_key: cleanKey(input.typeKey, input.label),
    label: input.label.trim(),
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  });
}

export function insertScopeSubtype(
  supabase: AdminClient,
  input: {
    scopeTypeId: string;
    label: string;
    subtypeKey?: string;
    escopoTemplate?: string;
    placeholderKeys?: string[];
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const escopoTemplate = input.escopoTemplate ?? "";
  return supabase.from("proposal_scope_subtypes").insert({
    scope_type_id: input.scopeTypeId,
    subtype_key: cleanKey(input.subtypeKey, input.label),
    label: input.label.trim(),
    escopo_template: escopoTemplate,
    investimento_template: "",
    placeholder_keys: cleanPlaceholders(input.placeholderKeys, escopoTemplate),
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  });
}

export function insertInvestmentType(
  supabase: AdminClient,
  input: {
    label: string;
    typeKey?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return supabase.from("proposal_investment_types").insert({
    type_key: cleanKey(input.typeKey, input.label),
    label: input.label.trim(),
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  });
}

export function insertInvestmentSubtype(
  supabase: AdminClient,
  input: {
    investmentTypeId: string;
    label: string;
    subtypeKey?: string;
    conceito?: string;
    template?: string;
    placeholderKeys?: string[];
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const template = input.template ?? "";
  return supabase.from("proposal_investment_subtypes").insert({
    investment_type_id: input.investmentTypeId,
    subtype_key: cleanKey(input.subtypeKey, input.label),
    label: input.label.trim(),
    conceito: input.conceito ?? "",
    template,
    placeholder_keys: cleanPlaceholders(input.placeholderKeys, template),
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  });
}

export async function nextScopeSubtypeSortOrder(
  supabase: AdminClient,
  scopeTypeId: string,
): Promise<number> {
  const { data } = await supabase
    .from("proposal_scope_subtypes")
    .select("sort_order")
    .eq("scope_type_id", scopeTypeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 10;
}

export async function nextInvestmentSubtypeSortOrder(
  supabase: AdminClient,
  investmentTypeId: string,
): Promise<number> {
  const { data } = await supabase
    .from("proposal_investment_subtypes")
    .select("sort_order")
    .eq("investment_type_id", investmentTypeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 10;
}
