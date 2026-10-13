/**
 * Tipo de contrato no ICP = plano de contas dos honorários pagos no SIOE (VIOS), com o nome
 * igual ao do SIOE e um plano por linha, sem reagrupar. Só a acentuação é consertada,
 * porque o VIOS às vezes grava o mesmo plano sem acento ou com acento quebrado.
 */

/** Planos de honorário do SIOE, na ordem de exibição. */
export const HONORARIO_PLANS = [
  "HONORÁRIOS MENSAIS",
  "HONORÁRIOS ADVOCATÍCIOS",
  "HONORÁRIOS SPOT",
  "HONORÁRIOS DE ÊXITO",
  "HONORÁRIOS DE SUCUMBÊNCIA",
  "HONORÁRIOS DE MANUTENÇÃO",
  "HONORÁRIOS POR HORA TRABALHADA",
] as const;

export type HonorarioPlan = (typeof HONORARIO_PLANS)[number];

export const HONORARIOS_MENSAIS: HonorarioPlan = "HONORÁRIOS MENSAIS";

const PLAN_PATTERNS: [RegExp, HonorarioPlan][] = [
  [/MENSA/, "HONORÁRIOS MENSAIS"],
  [/MANUTEN/, "HONORÁRIOS DE MANUTENÇÃO"],
  [/ADVOCAT/, "HONORÁRIOS ADVOCATÍCIOS"],
  [/SPOT/, "HONORÁRIOS SPOT"],
  [/XITO/, "HONORÁRIOS DE ÊXITO"],
  [/SUCUMB/, "HONORÁRIOS DE SUCUMBÊNCIA"],
  [/HORA/, "HONORÁRIOS POR HORA TRABALHADA"],
];

function fold(plano: string | null | undefined): string {
  return (plano ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
}

/**
 * Nome do plano como no SIOE ("HONORARIOS MENSAIS" e "Honorários mensais" viram
 * "HONORÁRIOS MENSAIS"). Plano que não está na lista mantém o próprio texto, em caixa alta.
 */
export function planLabel(plano: string | null | undefined): string {
  const folded = fold(plano);
  const known = PLAN_PATTERNS.find(([pattern]) => pattern.test(folded));
  if (known) return known[1];
  return (plano ?? "").trim().toUpperCase() || "SEM PLANO DE CONTAS";
}

/** Ordem de exibição: planos conhecidos na ordem do SIOE acima, depois os demais por nome. */
export function comparePlans(a: string, b: string): number {
  const ia = (HONORARIO_PLANS as readonly string[]).indexOf(a);
  const ib = (HONORARIO_PLANS as readonly string[]).indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b, "pt-BR");
}

/** Planos de um grupo com valor, na ordem do SIOE. */
export function sortedPlans(revenueByPlan: Record<string, number>): [string, number][] {
  return Object.entries(revenueByPlan)
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => comparePlans(a, b));
}

/** "HONORÁRIOS MENSAIS" → "mensais", para frases curtas ("61% mensais"). */
export function planShortLabel(plan: string): string {
  return plan.replace(/^HONOR[ÁA]RIOS\s+/i, "").toLocaleLowerCase("pt-BR");
}
