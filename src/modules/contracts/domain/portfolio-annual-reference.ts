/**
 * Referência anual do contrato, em centavos: o valor manual (`valor_anual_override`) manda; com cobrança
 * variável vale a projeção mensal × 12; senão o valor gravado (`valor_anual_referencia`). Sem valor gravado
 * (nenhum contrato tinha em 22/10/2026) cai na projeção mensal × 12 — antes a mensalidade fixa mostrava "—"
 * e ficava fora da soma do hub.
 */
export function annualReferenceCents(input: {
  overrideCents: string | null;
  storedCents: string | null;
  monthlyCents: number | null;
  variable: boolean;
}): string | null {
  if (input.overrideCents !== null) return input.overrideCents;
  const monthly = input.monthlyCents !== null && input.monthlyCents > 0 ? input.monthlyCents : null;
  if (input.variable && monthly !== null) return String(monthly * 12);
  if (input.storedCents !== null) return input.storedCents;
  return monthly !== null ? String(monthly * 12) : null;
}
