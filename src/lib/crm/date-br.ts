/**
 * Validação de datas `date_br` persistidas como ISO civil `YYYY-MM-DD` (sem timezone).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Verifica se a string é uma data civil válida (calendário gregoriano). */
export function isValidIsoDateString(s: string): boolean {
  const t = String(s).trim();
  if (!ISO_DATE.test(t)) return false;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Valor em branco ou não-ISO / data inválida → tratar como ausente (bloqueia se obrigatório). */
export function isEmptyOrInvalidDateBrStoredValue(
  v: string | string[] | undefined,
): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim();
  if (!s) return true;
  return !isValidIsoDateString(s);
}
