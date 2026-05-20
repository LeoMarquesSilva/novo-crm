/**
 * Tipos e avaliação de condições de campos (sem React).
 * Usado no servidor (API) e no cliente (dynamic-form).
 */

export type FieldCondition =
  | { type: "field_equals"; field: string; value: string }
  | { type: "field_contains"; field: string; value: string }
  | { type: "field_not_empty"; field: string }
  | { type: "field_in"; field: string; values: string[] }
  | null;

export interface FieldDefinition {
  id: string;
  field_code: string;
  /** Entidade lógica (ex.: oportunidade); usado na unicidade (entity_name, field_code). */
  entity_name?: string;
  label: string;
  field_type: string;
  is_required: boolean;
  condition_json: FieldCondition;
  field_options: string[] | null;
  sort_order: number;
  stage_code: string | null;
  pipeline_code: string;
  is_active: boolean;
}

export type FieldFormValues = Record<string, string | string[] | undefined>;

export function evaluateCondition(
  condition: FieldCondition,
  values: FieldFormValues,
): boolean {
  if (!condition) return true;

  const raw = values[condition.field];
  const fieldValue = Array.isArray(raw) ? raw : [raw ?? ""];

  switch (condition.type) {
    case "field_equals":
      return fieldValue.some(
        (v) => v?.toLowerCase() === condition.value.toLowerCase(),
      );
    case "field_contains":
      return fieldValue.some((v) =>
        v?.toLowerCase().includes(condition.value.toLowerCase()),
      );
    case "field_not_empty":
      return fieldValue.some((v) => !!v && v.trim() !== "");
    case "field_in":
      return fieldValue.some((v) => condition.values.includes(v ?? ""));
    default:
      return true;
  }
}
