import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { parseAreasList, parseEscopoJsonWithMeta } from "@/lib/crm/proposta-escopo-json";
import { displayStringToValueJson } from "@/lib/crm/pipeline-field-values";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Toggles de área de atuação (prática jurídica). Êxito fica no pagamento. */
export const CONTRACT_AREA_TOGGLES = [
  "cc_incluir_trabalhista",
  "cc_incluir_civel",
  "cc_incluir_contratual",
  "cc_incluir_tributario",
] as const;

export const CONTRACT_EXITO_TOGGLE = "cc_incluir_exito" as const;

export const CONTRACT_INHERITED_TOGGLES = [
  ...CONTRACT_AREA_TOGGLES,
  CONTRACT_EXITO_TOGGLE,
] as const;

export type ContractAreaToggle = (typeof CONTRACT_AREA_TOGGLES)[number];
export type ContractInheritedToggle = (typeof CONTRACT_INHERITED_TOGGLES)[number];

const AREA_TO_TOGGLE: Record<string, ContractAreaToggle> = {
  Trabalhista: "cc_incluir_trabalhista",
  Cível: "cc_incluir_civel",
  "Societário e Contratos": "cc_incluir_contratual",
  Tributário: "cc_incluir_tributario",
};

export function contractAreaTogglesFromProposal(fieldByCode: Record<string, string>): Partial<
  Record<ContractInheritedToggle, "Sim">
> {
  const out: Partial<Record<ContractInheritedToggle, "Sim">> = {};
  const areas = new Set<string>();

  for (const raw of parseAreasList(fieldByCode.cp_areas_objeto ?? "")) {
    areas.add(normalizePracticeAreaKey(raw));
  }

  const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(
    fieldByCode.cp_escopo_detalhe_json ?? "",
  );
  for (const key of Object.keys(escopo)) {
    if (key.trim()) areas.add(normalizePracticeAreaKey(key));
  }

  for (const area of areas) {
    const toggle = AREA_TO_TOGGLE[area];
    if (toggle) out[toggle] = "Sim";
  }

  if (proposalHasExito(investimentoDocumento, escopo)) {
    out.cc_incluir_exito = "Sim";
  }

  return out;
}

export function mergeInheritedContractAreaToggles(
  current: Record<string, string>,
  inherited: Partial<Record<ContractInheritedToggle, "Sim">>,
): Record<string, string> {
  const next = { ...current };
  for (const [code, value] of Object.entries(inherited)) {
    const existing = String(next[code] ?? "").trim();
    if (existing === "Sim" || existing === "Não") continue;
    next[code] = value;
  }
  return next;
}

export async function applyInheritedContractAreaToggles(params: {
  supabase: AdminClient;
  oportunidadeId: string;
  fieldByCode: Record<string, string>;
  updatedBy?: string | null;
}): Promise<Record<string, string>> {
  const inherited = contractAreaTogglesFromProposal(params.fieldByCode);
  const merged = mergeInheritedContractAreaToggles(params.fieldByCode, inherited);
  const toWrite = CONTRACT_INHERITED_TOGGLES.filter(
    (code) => merged[code] !== params.fieldByCode[code] && merged[code] === "Sim",
  );
  if (toWrite.length === 0) return merged;

  const { data: defs, error: defErr } = await params.supabase
    .from("field_definitions")
    .select("id, field_code, field_type")
    .eq("entity_name", "oportunidade")
    .in("field_code", [...toWrite]);
  if (defErr) throw defErr;

  const now = new Date().toISOString();
  for (const def of defs ?? []) {
    const code = String(def.field_code);
    const valueJson = displayStringToValueJson(String(def.field_type), "Sim");
    const { data: existingRows, error: exErr } = await params.supabase
      .from("field_values")
      .select("id")
      .eq("entity_name", "oportunidade")
      .eq("entity_record_id", params.oportunidadeId)
      .eq("field_definition_id", def.id)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (exErr) throw exErr;
    const existing = existingRows?.[0];
    if (existing?.id) {
      const { error } = await params.supabase
        .from("field_values")
        .update({
          value_json: valueJson as never,
          updated_at: now,
          updated_by: params.updatedBy ?? null,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await params.supabase.from("field_values").insert({
        entity_name: "oportunidade",
        entity_record_id: params.oportunidadeId,
        field_definition_id: def.id,
        value_json: valueJson as never,
        updated_at: now,
        updated_by: params.updatedBy ?? null,
      });
      if (error) throw error;
    }
  }

  return merged;
}

function proposalHasExito(
  investimentoDocumento: ReturnType<typeof parseEscopoJsonWithMeta>["investimentoDocumento"],
  escopo: ReturnType<typeof parseEscopoJsonWithMeta>["escopo"],
): boolean {
  const docItems = investimentoDocumento?.items?.length
    ? investimentoDocumento.items
    : investimentoDocumento
      ? [investimentoDocumento]
      : [];
  if (docItems.some((item) => String(item.subtipoId ?? "").toLowerCase().includes("exito"))) {
    return true;
  }
  for (const entries of Object.values(escopo)) {
    for (const entry of entries) {
      if (String(entry.investimento?.subtipoId ?? "").toLowerCase().includes("exito")) {
        return true;
      }
    }
  }
  return false;
}
