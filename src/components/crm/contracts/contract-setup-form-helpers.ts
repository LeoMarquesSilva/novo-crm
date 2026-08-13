import {
  formatNumberPtBr2,
  maskBrlCurrencyFromInput,
  parseBrlUserInput,
} from "@/lib/crm/proposta-valor-brl-extenso";

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

/** Máscara de percentual: dígitos como centésimos (`1500` → `15,00%`). */
export function maskPercentFromInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (!digits) return "";
  return `${formatNumberPtBr2(Number(digits) / 100)}%`;
}

export function maskedPercentToBasisPoints(masked: string): number | null {
  const digits = masked.replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
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
