import type { ContractAdjustment, ContractAdjustmentIndex } from "./types";

/** Índices oferecidos na etapa de contrato; "Sem reajuste" não gera cláusula. */
export const CONTRACT_ADJUSTMENT_INDICES: readonly ContractAdjustmentIndex[] = ["IPCA", "IGP-M", "INPC", "Sem reajuste"];

/** Periodicidades oferecidas (meses). */
export const CONTRACT_ADJUSTMENT_PERIODS = [12, 24, 6] as const;

const INDEX_FULL_NAME: Record<Exclude<ContractAdjustmentIndex, "Sem reajuste">, string> = {
  IPCA: "Índice Nacional de Preços ao Consumidor Amplo (IPCA/IBGE)",
  "IGP-M": "Índice Geral de Preços do Mercado (IGP-M/FGV)",
  INPC: "Índice Nacional de Preços ao Consumidor (INPC/IBGE)",
};

const EXTENSO: Record<number, string> = {
  1: "um",
  2: "dois",
  3: "três",
  4: "quatro",
  6: "seis",
  12: "doze",
  18: "dezoito",
  24: "vinte e quatro",
  36: "trinta e seis",
};

/** Reajuste guardado no rascunho do contrato (`contract_adjustment`); inválido = não escolhido. */
export function parseContractAdjustment(raw: unknown): ContractAdjustment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { index, periodMonths } = raw as Record<string, unknown>;
  if (typeof index !== "string" || !(CONTRACT_ADJUSTMENT_INDICES as readonly string[]).includes(index)) return null;
  if (index === "Sem reajuste") return { index, periodMonths: null };
  const months = Number(periodMonths);
  return {
    index: index as ContractAdjustmentIndex,
    periodMonths: Number.isInteger(months) && months > 0 && months <= 120 ? months : 12,
  };
}

export function adjustmentPeriodText(months: number): string {
  return `${months} (${EXTENSO[months] ?? String(months)}) ${months === 1 ? "mês" : "meses"}`;
}

/** Placeholders da cláusula de reajuste; null quando não há cláusula ("Sem reajuste" ou não escolhido). */
export function adjustmentPlaceholders(adjustment: ContractAdjustment | null | undefined): Record<string, string> | null {
  if (!adjustment || adjustment.index === "Sem reajuste") return null;
  return {
    "[INDICE_REAJUSTE]": INDEX_FULL_NAME[adjustment.index],
    "[PERIODICIDADE_REAJUSTE]": adjustmentPeriodText(adjustment.periodMonths ?? 12),
  };
}

/** Rótulo curto para a tela ("IPCA a cada 12 meses"). */
export function describeAdjustment(adjustment: ContractAdjustment | null | undefined): string {
  if (!adjustment) return "Não definido";
  if (adjustment.index === "Sem reajuste") return "Sem reajuste";
  const months = adjustment.periodMonths ?? 12;
  return `${adjustment.index} a cada ${months} ${months === 1 ? "mês" : "meses"}`;
}
