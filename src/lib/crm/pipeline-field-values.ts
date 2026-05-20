/** Parse de `field_definitions.field_options` (jsonb) → lista de opções. */
export function fieldOptionsFromDb(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    return raw as string[];
  }
  return null;
}

/** Converte `value_json` da BD para texto mostrado na ficha. */
export function valueJsonToDisplayString(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

/** Converte texto editado para `value_json` conforme o tipo do campo (alinhado à transição de etapa). */
export function displayStringToValueJson(fieldType: string, value: string): unknown {
  const t = value.trim();
  if (fieldType === "multiselect") {
    return t.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return t;
}
