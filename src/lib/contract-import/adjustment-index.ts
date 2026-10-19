import { normalizeAdjustmentIndex, type ContractImportExtraction } from "./schemas";

const INDEX_PATTERNS: Record<string, RegExp> = {
  IPCA: /\bIPCA\b(?![-–\s]*E\b)/i,
  "IPCA-E": /\bIPCA[-–\s]*E\b/i,
  "IGP-M": /\bIGP[-–\s]*M\b/i,
  INPC: /\bINPC\b/i,
};

const READJUSTMENT = /reajust/i;
const ARREARS = /\b(atras|mora\b|inadimpl|multa|juros)/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.;:])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Descarta o índice de reajuste que a IA tirou da cláusula de atraso (correção do valor em
 * mora, como "multa de 20% ... com atualização pelo IPCA-E"): só vale índice citado como
 * reajuste dos honorários. Sem trecho para conferir, mantém o que a IA leu.
 */
export function dropArrearsAdjustmentIndex(
  extraction: ContractImportExtraction,
  text: string,
): ContractImportExtraction {
  const index = normalizeAdjustmentIndex(extraction.adjustmentIndex);
  const pattern = index ? INDEX_PATTERNS[index] : undefined;
  if (!pattern) return extraction;
  // Frases do contrato que citam o índice; sem elas, o trecho que a IA apontou.
  const mentions = sentences(text).filter((sentence) => pattern.test(sentence));
  const contexts = mentions.length
    ? mentions
    : extraction.evidence.filter((item) => item.field === "adjustmentIndex").map((item) => item.quote);
  if (contexts.length === 0) return extraction;
  if (contexts.some((context) => READJUSTMENT.test(context))) return extraction;
  if (!contexts.every((context) => ARREARS.test(context))) return extraction;
  return {
    ...extraction,
    adjustmentIndex: null,
    evidence: extraction.evidence.filter((item) => item.field !== "adjustmentIndex"),
  };
}
