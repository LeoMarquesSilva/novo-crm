/** Competência do fechamento digitada como mês/ano ("10/2026") e gravada como `yyyy-mm-01`. */
export function maskCompetencyMonth(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** "10/2026" → "2026-10-01"; mês inválido ou incompleto → null. */
export function competencyMonthToYmd(text: string): string | null {
  const match = /^(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return `${match[2]}-${match[1]}-01`;
}

/** "2026-10-01" → "10/2026". */
export function ymdToCompetencyMonth(ymd: string): string {
  return /^\d{4}-\d{2}/.test(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "";
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10-01" → "out/2026" (chips e títulos do fechamento). */
export function formatCompetencyLabel(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}/.test(ymd)) return ymd ?? "";
  const month = Number(ymd.slice(5, 7));
  return `${MONTHS[month - 1] ?? ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}
