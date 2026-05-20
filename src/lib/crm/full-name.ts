/**
 * Nome de pessoa com pelo menos dois segmentos (ex.: nome + sobrenome).
 * Um único token como "João" não é aceite.
 */
export function isValidFullNameTokens(text: string): boolean {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  return parts.length >= 2;
}
