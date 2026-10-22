import {
  formatNumberPtBr2,
  maskBrlCurrencyFromInput,
  parseBrlUserInput,
} from "@/lib/crm/proposta-valor-brl-extenso";
import { formatDateYmdBr } from "@/lib/format-datetime";
import { isMonthlyFeeStartingMidMonth } from "@/modules/contracts/domain/competency";
import { competencyOf } from "@/modules/contracts/domain/installment-schedule";
import { nextCompetencyMonth } from "@/modules/contracts/domain/variable-usage-projection";

export function newContractDraftId() {
  return crypto.randomUUID();
}

/** Centavos → texto mascarado `R$ 1.234,56` para o input. */
export function centsToMaskedBrl(cents: string | number | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "";
  const value = Number(cents);
  if (!Number.isFinite(value)) return "";
  return maskBrlCurrencyFromInput(String(Math.max(0, Math.round(value))));
}

/** Texto mascarado BRL → centavos string. */
export function maskedBrlToCents(masked: string): string | null {
  const reais = parseBrlUserInput(masked);
  if (reais === null) return null;
  return String(Math.round(reais * 100));
}

/** Basis points (1500 = 15%) → `15,00%`. */
export function basisPointsToMaskedPercent(basisPoints: number | null | undefined): string {
  if (basisPoints === null || basisPoints === undefined) return "";
  return `${formatNumberPtBr2(basisPoints / 100)}%`;
}

/** Basis points → texto editável sem `%` (`1500` → `15`, `1250` → `12,5`). */
export function basisPointsToPercentText(basisPoints: number | null | undefined): string {
  if (basisPoints === null || basisPoints === undefined) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, useGrouping: false }).format(
    basisPoints / 100,
  );
}

/**
 * Texto digitado no campo de percentual: o número é o próprio percentual (`5` = 5%,
 * `12,5` = 12,5%), com até 3 inteiros e 2 decimais. Devolve o texto limpo ou `null`
 * quando a tecla não forma um percentual (o campo mantém o valor anterior).
 */
export function sanitizePercentTyping(raw: string): string | null {
  const text = raw.replace(/[%\s]/g, "").replace(".", ",");
  return /^\d{0,3}(,\d{0,2})?$/.test(text) ? text : null;
}

/** Texto do percentual (`12,5`) → basis points (`1250`); vazio → `null`. */
export function percentTextToBasisPoints(text: string): number | null {
  const normalized = text.replace(",", ".");
  if (!normalized || normalized === ".") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Competência `AAAA-MM-01` → `out/2026`. */
export function competencyLabel(competency: string): string {
  return `${MONTH_LABELS[Number(competency.slice(5, 7)) - 1] ?? ""}/${competency.slice(0, 4)}`;
}

/**
 * Explicação da pergunta sobre a mensalidade que começa no meio do mês, com os meses do contrato;
 * `null` quando nenhuma mensalidade começa depois do dia 1.
 */
export function startMonthBillingHelp(
  components: Array<{ kind: string; effectiveFrom?: string | null }>,
  options: { replacesVersion: boolean },
): string | null {
  const start = components
    .filter(isMonthlyFeeStartingMidMonth)
    .map((component) => component.effectiveFrom!)
    .sort()[0];
  if (!start) return null;
  const month = competencyOf(start);
  const parts = [
    `A mensalidade começa em ${formatDateYmdBr(start)}.`,
    `Mês cheio: cobra ${competencyLabel(month)} inteiro; o mês em que a vigência termina no meio não é cobrado.`,
    `Mês seguinte: a 1ª mensalidade é de ${competencyLabel(nextCompetencyMonth(month))}; o mês do fim é cobrado.`,
  ];
  if (options.replacesVersion) {
    parts.push(`Em reajuste ou aditivo, "mês seguinte" deixa ${competencyLabel(month)} sem mensalidade, porque a versão anterior não fecha mais esse mês.`);
  }
  return parts.join(" ");
}

export const BILLING_KIND_LABELS: Record<string, string> = {
  mensal_fixo: "Mensalidade fixa",
  mensal_preco_fechado: "Preço fechado (parcelas)",
  mensal_escalonado: "Mensalidade escalonada",
  variavel_processo: "Variável por processo",
  variavel_hora: "Variável por hora",
  mensal_condicionado: "Mensal condicionado",
  spot: "Spot",
  manutencao: "Manutenção",
  exito_percentual: "Êxito percentual",
  exito_valor_fixo: "Êxito valor fixo",
  acordo: "Acordo",
  despesa_km: "Despesa KM",
  reembolso: "Reembolso",
  ajuste: "Ajuste",
};

export const TRIGGER_KINDS = new Set([
  "exito_percentual",
  "exito_valor_fixo",
  "mensal_condicionado",
  "reembolso",
  "spot",
  "acordo",
]);

/** Índices de reajuste contratual — select fechado (sem texto livre). */
export const ADJUSTMENT_INDEX_OPTIONS = [
  "IPCA",
  "IGP-M",
  "INPC",
  "IPCA-E",
  "Sem reajuste",
] as const;

export type AdjustmentIndexOption = (typeof ADJUSTMENT_INDEX_OPTIONS)[number];

export const ADJUSTMENT_INDEX_LABELS: Record<string, string> = Object.fromEntries(
  ADJUSTMENT_INDEX_OPTIONS.map((option) => [option, option]),
);
