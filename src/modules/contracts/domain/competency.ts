import { competencyOf } from "./installment-schedule";

type Period = { effectiveFrom?: string | null; effectiveTo?: string | null };

/**
 * Como cobrar a mensalidade fixa que começa depois do dia 1 (decisão do Financeiro na configuração,
 * `contrato_versoes.cobranca_mes_inicio`):
 * - `mes_cheio`: cobra o mês de início inteiro; o mês em que o período termina no meio fica para
 *   quem começa nele (faixa ou versão seguinte) e não é cobrado se nada vier depois.
 * - `mes_seguinte`: começa na competência seguinte; o mês em que o período termina é cobrado.
 * Nos dois casos, 12 meses de vigência dão 12 mensalidades.
 */
export type StartMonthBilling = "mes_cheio" | "mes_seguinte";

/** Sem resposta (versões anteriores à pergunta), vale a regra que o fechamento sempre usou. */
export const DEFAULT_START_MONTH_BILLING: StartMonthBilling = "mes_seguinte";

export const START_MONTH_BILLING_LABELS: Record<StartMonthBilling, string> = {
  mes_cheio: "Cobrar o mês de início cheio",
  mes_seguinte: "Começar no mês seguinte",
};

/** Valor fixo por mês: mensalidade, manutenção, faixa escalonada e o ajuste que as acompanha. */
const MONTHLY_FIXED_KINDS = new Set(["mensal_fixo", "mensal_escalonado", "manutencao", "ajuste"]);

export function parseStartMonthBilling(value: unknown): StartMonthBilling | null {
  return value === "mes_cheio" || value === "mes_seguinte" ? value : null;
}

function dayAfter(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Algum dia do mês da competência (AAAA-MM-01) está no período. */
export function periodTouchesCompetency(period: Period, competency: string): boolean {
  if (period.effectiveFrom && competencyOf(period.effectiveFrom) > competency) return false;
  if (period.effectiveTo && period.effectiveTo < competency) return false;
  return true;
}

/** O período já está vigente no dia 1 da competência (AAAA-MM-01). */
function periodCoversCompetencyStart(period: Period, competency: string): boolean {
  if (period.effectiveFrom && period.effectiveFrom > competency) return false;
  if (period.effectiveTo && period.effectiveTo < competency) return false;
  return true;
}

/** O período começa até o mês da competência e segue até o último dia dela. */
function periodRunsThroughCompetencyEnd(period: Period, competency: string): boolean {
  if (period.effectiveFrom && competencyOf(period.effectiveFrom) > competency) return false;
  if (period.effectiveTo && competencyOf(dayAfter(period.effectiveTo)) <= competency) return false;
  return true;
}

/** Valor fixo por mês que começa depois do dia 1: pede a decisão `StartMonthBilling`. */
export function isMonthlyFeeStartingMidMonth(component: Period & { kind: string }): boolean {
  return MONTHLY_FIXED_KINDS.has(component.kind) &&
    Boolean(component.effectiveFrom) &&
    component.effectiveFrom!.slice(8, 10) !== "01";
}

/**
 * O componente entra na competência. Parcela, variável, êxito, reembolso, spot e acordo valem
 * em todo mês que o período toca: a 1ª parcela de quem começa em 18/10 fecha em outubro.
 * Valor fixo por mês segue `startMonthBilling` (ver `StartMonthBilling`).
 */
export function isComponentEffectiveInCompetency(
  component: Period & { kind: string },
  competency: string,
  startMonthBilling?: StartMonthBilling | null,
): boolean {
  if (!MONTHLY_FIXED_KINDS.has(component.kind)) return periodTouchesCompetency(component, competency);
  return (startMonthBilling ?? DEFAULT_START_MONTH_BILLING) === "mes_cheio"
    ? periodRunsThroughCompetencyEnd(component, competency)
    : periodCoversCompetencyStart(component, competency);
}

/** Componentes da versão que entram na competência; sem fim próprio, o componente acaba com a versão. */
export function selectComponentsInCompetency<T extends Period & { kind: string }>(
  version: { effectiveTo?: string | null; startMonthBilling?: StartMonthBilling | null; components: T[] },
  competency: string,
): T[] {
  return version.components.filter((component) =>
    isComponentEffectiveInCompetency(
      { ...component, effectiveTo: component.effectiveTo ?? version.effectiveTo ?? null },
      competency,
      version.startMonthBilling,
    ));
}
