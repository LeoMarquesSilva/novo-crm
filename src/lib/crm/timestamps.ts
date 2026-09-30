/** Compara instantes ISO mesmo com `Z` vs `+00:00` e microssegundos truncados no RSC. */
export function timestampsMatch(left: string, right: string): boolean {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return left === right;
  return Math.abs(a - b) < 1000;
}

export const isoTimestampSchemaMessage = "Informe um instante ISO-8601 válido.";

export function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
