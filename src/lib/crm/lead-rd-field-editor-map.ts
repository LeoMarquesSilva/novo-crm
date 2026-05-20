import { isRdFieldAppUserKey } from "@/lib/crm/lead-rd-field-labels";
import { leadAreas } from "@/modules/crm/application/services/new-lead-payload";

/** Alinhado ao modal de transição / `field_definitions` (tributação [CP]). */
const RD_TRIBUTACAO_OPTIONS = ["Valor Líquido de Tributos", "Valor Englobando Tributos"] as const;

/** Referência operacional (Confeccão de Contrato [CC]). */
const RD_TIPO_INSTRUMENTO_OPTIONS = ["Contrato", "Aditivo", "Acordo/Confissão"] as const;

const RD_YESNO_KEYS = new Set<string>([
  "havera_due_diligence",
  "realizou_due_diligence",
  "consulta_auto_cadastro",
]);

const RD_MULTI_AREAS_KEYS = new Set<string>([
  "areas_analise",
  "areas_comparecimento",
  "areas_cp",
]);

export type RdFieldEditorResolved =
  | { kind: "textarea" }
  | { kind: "user" }
  | { kind: "yesno" }
  | { kind: "select"; options: readonly string[] }
  | { kind: "multiselect"; options: readonly string[] };

/**
 * Define UI de edição dos campos RD (snapshot + overrides), alinhada aos valores válidos no CRM/pipeline.
 */
export function resolveRdFieldEditor(fieldKey: string): RdFieldEditorResolved {
  if (isRdFieldAppUserKey(fieldKey)) {
    return { kind: "user" };
  }
  if (RD_YESNO_KEYS.has(fieldKey)) {
    return { kind: "yesno" };
  }
  if (fieldKey === "tributacao") {
    return { kind: "select", options: RD_TRIBUTACAO_OPTIONS };
  }
  if (fieldKey === "tipo_instrumento") {
    return { kind: "select", options: RD_TIPO_INSTRUMENTO_OPTIONS };
  }
  if (RD_MULTI_AREAS_KEYS.has(fieldKey)) {
    return { kind: "multiselect", options: leadAreas };
  }
  return { kind: "textarea" };
}
