import { getPrimarySumKeyForSubtipo } from "@/lib/crm/proposta-investimento-consolidado";
import {
  PARCELAS_KEY,
  PARCELAS_VENCIMENTOS_KEY,
  VALOR_PARCELA_KEY,
  parseParcelasCount,
} from "@/lib/crm/proposta-investimento-parcelas";
import { formatBrlComExtenso, nearlyEqualMoney, parseAmount } from "./money";
import type {
  ContractInvestment,
  ContractInvestmentItem,
  ContractPayment,
  ContractPaymentMethod,
} from "./types";

export function detectPaymentMethod(
  placeholders: Record<string, string>,
  ccTipoPagamento?: string,
): ContractPaymentMethod {
  const blob = `${ccTipoPagamento ?? ""} ${Object.values(placeholders).join(" ")}`.toLowerCase();
  const hasBoleto = blob.includes("boleto");
  const hasPix = blob.includes("pix");
  const hasTed =
    blob.includes("transfer") || blob.includes("ted") || blob.includes("conta banc");
  const count = [hasBoleto, hasPix, hasTed].filter(Boolean).length;
  if (count > 1) return "combinado";
  if (hasBoleto) return "boleto";
  if (hasPix) return "pix";
  if (hasTed) return "transferencia";
  return "indefinido";
}

export function firstDueDateFromPlaceholders(placeholders: Record<string, string>): string | null {
  for (const key of ["PRIMEIROVENCIMENTO", "DATAVENCIMENTO", "VENCIMENTO", "PRIMEIRO_VENCIMENTO"]) {
    const v = placeholders[key]?.trim();
    if (v) return v;
  }
  const list = placeholders[PARCELAS_VENCIMENTOS_KEY]?.trim();
  if (list) {
    const first = list.split(/[|\u001e]/)[0]?.trim();
    if (first) return first;
  }
  return null;
}

export function buildPaymentFromInvestment(
  investment: ContractInvestment,
  ccTipoPagamento?: string,
): ContractPayment {
  const placeholders = mergePlaceholders(investment.items);
  const method = detectPaymentMethod(placeholders, ccTipoPagamento);
  const firstDueDate = firstDueDateFromPlaceholders(placeholders);
  const parts: string[] = [];
  let installmentCount: number | null = null;
  let downPayment: number | null = null;
  let arithmeticOk = true;
  let arithmeticNote: string | null = null;

  for (const item of investment.items) {
    const rendered = renderInvestmentItem(item);
    parts.push(rendered.text);
    if (rendered.installmentCount != null) installmentCount = rendered.installmentCount;
    if (rendered.downPayment != null) downPayment = rendered.downPayment;
    if (rendered.arithmeticOk === false) {
      arithmeticOk = false;
      arithmeticNote = rendered.arithmeticNote;
    }
  }

  if (parts.length === 0) {
    parts.push("As condições de honorários ainda não foram herdadas da proposta.");
  }

  return {
    method,
    clauseText: parts.join(" "),
    firstDueDate,
    installmentCount,
    downPayment,
    arithmeticOk,
    arithmeticNote,
  };
}

function mergePlaceholders(items: ContractInvestmentItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    Object.assign(out, item.placeholders);
  }
  return out;
}

function renderInvestmentItem(item: ContractInvestmentItem): {
  text: string;
  installmentCount: number | null;
  downPayment: number | null;
  arithmeticOk: boolean;
  arithmeticNote: string | null;
} {
  const ph = item.placeholders;
  const amount = item.amount;
  const valor = amount != null ? formatBrlComExtenso(amount) : "";
  const parcelas = parseParcelasCount(ph);
  const valorParcela = parseAmount(ph[VALOR_PARCELA_KEY] ?? "");
  const entrada = parseAmount(ph.VALORENTRADA ?? ph.ENTRADA ?? "");

  if (item.subtipoId.includes("exito") && !item.subtipoId.includes("mensal") && !item.subtipoId.includes("spot")) {
    const pct = ph.PERCENTUALEXITO ?? ph.PERCENTUAL ?? "";
    return {
      text: pct
        ? `Honorários de êxito equivalentes a ${pct} sobre o proveito econômico.`
        : "Honorários de êxito conforme condições da proposta.",
      installmentCount: null,
      downPayment: null,
      arithmeticOk: true,
      arithmeticNote: null,
    };
  }

  if (item.subtipoId.includes("manutencao") && amount != null) {
    return {
      text: `Honorários de manutenção de ${valor}.`,
      installmentCount: null,
      downPayment: null,
      arithmeticOk: true,
      arithmeticNote: null,
    };
  }

  if (item.subtipoId.startsWith("mensal") && amount != null) {
    const extra = item.subtipoId.includes("exito")
      ? ` Acrescem-se honorários de êxito conforme a proposta.`
      : "";
    return {
      text: `Honorários mensais de ${valor}.${extra}`,
      installmentCount: null,
      downPayment: null,
      arithmeticOk: true,
      arithmeticNote: null,
    };
  }

  if (entrada != null && parcelas > 0 && valorParcela != null && amount != null) {
    const soma = entrada + parcelas * valorParcela;
    const ok = nearlyEqualMoney(soma, amount);
    return {
      text: `Valor total de ${valor}, com entrada de ${formatBrlComExtenso(entrada)} e ${parcelas} parcelas de ${formatBrlComExtenso(valorParcela)}.`,
      installmentCount: parcelas,
      downPayment: entrada,
      arithmeticOk: ok,
      arithmeticNote: ok
        ? null
        : `Soma entrada + parcelas (${soma.toFixed(2)}) difere do total (${amount.toFixed(2)}).`,
    };
  }

  if (parcelas > 0 && valorParcela != null && amount != null) {
    const soma = parcelas * valorParcela;
    const ok = nearlyEqualMoney(soma, amount);
    return {
      text: `Valor total de ${valor}, pago em ${parcelas} parcelas de ${formatBrlComExtenso(valorParcela)}.`,
      installmentCount: parcelas,
      downPayment: null,
      arithmeticOk: ok,
      arithmeticNote: ok
        ? null
        : `Soma das parcelas (${soma.toFixed(2)}) difere do total (${amount.toFixed(2)}).`,
    };
  }

  if (amount != null) {
    return {
      text: `Valor total de ${valor}.`,
      installmentCount: parcelas > 0 ? parcelas : null,
      downPayment: entrada,
      arithmeticOk: true,
      arithmeticNote: null,
    };
  }

  const raw = ph[getPrimarySumKeyForSubtipo(item.subtipoId) ?? ""] ?? ph[PARCELAS_KEY] ?? "";
  return {
    text: raw
      ? `Condições comerciais da proposta: ${raw}.`
      : "Investimento da proposta sem valor numérico interpretável.",
    installmentCount: null,
    downPayment: null,
    arithmeticOk: true,
    arithmeticNote: null,
  };
}
