/**
 * Geração de `field_code` a partir do label (snake_case, sem acentos).
 * Deve coincidir com a lógica usada em POST /api/admin/fields.
 */

export function slugifyFieldCodeFromLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "campo";

  const n = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  let s = n
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!s) return "campo";

  if (!/^[a-z]/.test(s)) {
    s = `c_${s}`;
  }

  s = s
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!s || !/^[a-z]/.test(s)) return "campo";

  if (s.length > 60) {
    s = s.slice(0, 60).replace(/_+$/, "");
  }

  return s || "campo";
}

/** Garante código único para a entidade: base, base_2, base_3, … */
export function nextAvailableFieldCode(base: string, existingCodes: string[]): string {
  const used = new Set(existingCodes);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

/**
 * Chave estável para comparar labels no mesmo funil (dedupe no admin).
 * Alinha-se à remoção de acentos usada em {@link slugifyFieldCodeFromLabel}.
 */
export function normalizeLabelKey(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  const n = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return n.replace(/\s+/g, " ");
}
