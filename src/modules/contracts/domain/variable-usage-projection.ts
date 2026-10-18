export type VariableUsageSnapshot = {
  competency: string;
  foldersTotal: number;
  hoursTotal: number;
  foldersByArea: Record<string, number>;
  hoursByArea: Record<string, number>;
};

export type ProjectionComponent = {
  kind: string;
  areaId?: string | null;
  amountCents?: bigint | number | string | null;
  unitAmountCents?: bigint | number | string | null;
  chargeMode?: string | null;
  includedQuantity?: number | null;
  installments?: Array<{ amountCents?: bigint | number | string | null; competency?: string }>;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

const RECURRING_FIXED = new Set(["mensal_fixo", "mensal_escalonado", "manutencao"]);

export function asFiniteNumber(value: bigint | number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function billableUsageQuantity(
  chargeMode: string | null | undefined,
  includedQuantity: number | null | undefined,
  actualQuantity: number,
): number {
  if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) return 0;
  if (chargeMode === "excedente") {
    return Math.max(0, actualQuantity - (includedQuantity ?? 0));
  }
  return actualQuantity;
}

export function projectVariableAmountCents(input: {
  unitAmountCents: bigint | number | string | null | undefined;
  chargeMode: string | null | undefined;
  includedQuantity: number | null | undefined;
  actualQuantity: number;
}): number {
  const unit = asFiniteNumber(input.unitAmountCents);
  const billable = billableUsageQuantity(input.chargeMode, input.includedQuantity, input.actualQuantity);
  if (unit <= 0 || billable <= 0) return 0;
  return Math.round(unit * billable);
}

export function usageQuantityForKind(
  kind: string,
  areaKey: string | null | undefined,
  usage: VariableUsageSnapshot | null | undefined,
): number {
  if (!usage) return 0;
  const byArea = kind === "variavel_processo" ? usage.foldersByArea : kind === "variavel_hora" ? usage.hoursByArea : null;
  const total = kind === "variavel_processo" ? usage.foldersTotal : kind === "variavel_hora" ? usage.hoursTotal : 0;
  if (!byArea) return 0;
  if (!areaKey) return total;
  if (byArea[areaKey] != null) return byArea[areaKey];
  const needle = areaKey.toLocaleLowerCase("pt-BR");
  const match = Object.entries(byArea).find(([key]) => key.toLocaleLowerCase("pt-BR") === needle);
  return match?.[1] ?? 0;
}

/** O componente vale na competência (AAAA-MM-01) quando o período cobre algum dia do mês. */
export function isEffectiveInCompetency(component: ProjectionComponent, competency: string): boolean {
  if (component.effectiveFrom && `${component.effectiveFrom.slice(0, 7)}-01` > competency) return false;
  if (component.effectiveTo && component.effectiveTo < competency) return false;
  return true;
}

/**
 * Valor mensal projetado do componente. Com `competency`, respeita o período do componente
 * (manutenção que só começa depois das parcelas fica fora) e usa a parcela daquele mês;
 * sem ela, considera o componente vigente e a 1ª parcela.
 */
export function projectMonthlyComponentCents(
  component: ProjectionComponent,
  areaKey: string | null | undefined,
  usage: VariableUsageSnapshot | null | undefined,
  competency?: string,
): number {
  if (competency && !isEffectiveInCompetency(component, competency)) return 0;
  if (RECURRING_FIXED.has(component.kind)) return asFiniteNumber(component.amountCents);
  if (component.kind === "mensal_preco_fechado") {
    const installment = competency
      ? component.installments?.find((entry) => entry.competency === competency)
      : component.installments?.[0];
    return asFiniteNumber(installment?.amountCents);
  }
  if (component.kind === "variavel_processo" || component.kind === "variavel_hora") {
    return projectVariableAmountCents({
      unitAmountCents: component.unitAmountCents,
      chargeMode: component.chargeMode,
      includedQuantity: component.includedQuantity,
      actualQuantity: usageQuantityForKind(component.kind, areaKey, usage),
    });
  }
  return 0;
}

export function projectMonthlyTotalCents(
  components: ProjectionComponent[],
  areaKeyById: ReadonlyMap<string, string>,
  usage: VariableUsageSnapshot | null | undefined,
  competency?: string,
): number {
  return components.reduce((sum, component) => {
    const areaKey = component.areaId ? (areaKeyById.get(component.areaId) ?? null) : null;
    return sum + projectMonthlyComponentCents(component, areaKey, usage, competency);
  }, 0);
}

export type ProjectionRun = {
  /** Primeira competência do trecho (AAAA-MM-01). */
  from: string;
  /** Última competência do trecho; `null` quando segue além do horizonte projetado. */
  to: string | null;
  cents: number;
};

/** Projeção mês a mês a partir de `fromCompetency`, agrupada em trechos de mesmo valor. */
export function projectMonthlyRuns(
  components: ProjectionComponent[],
  areaKeyById: ReadonlyMap<string, string>,
  usage: VariableUsageSnapshot | null | undefined,
  fromCompetency: string,
  months = 24,
): ProjectionRun[] {
  const runs: ProjectionRun[] = [];
  let competency = fromCompetency;
  for (let index = 0; index < months; index += 1) {
    const cents = projectMonthlyTotalCents(components, areaKeyById, usage, competency);
    const last = runs.at(-1);
    if (last && last.cents === cents) last.to = competency;
    else runs.push({ from: competency, to: competency, cents });
    competency = nextCompetencyMonth(competency);
  }
  const last = runs.at(-1);
  if (last) last.to = null;
  return runs;
}

export function nextCompetencyMonth(competency: string): string {
  const match = /^(\d{4})-(\d{2})-01$/.exec(competency);
  if (!match) throw new Error("Competency must use YYYY-MM-01");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
