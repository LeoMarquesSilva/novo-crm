import { getPrimarySumKeyForSubtipo } from "@/lib/crm/proposta-investimento-consolidado";
import {
  PARCELAS_KEY,
  PARCELAS_VENCIMENTOS_KEY,
  VALOR_PARCELA_KEY,
  formatCronogramaParcelasIguais,
  formatParcelasDistintasDetalhe,
  getParcelaValues,
  getParcelaVencimentos,
  getParcelasModo,
  normalizeParcelaVencimento,
  parcelasQuantidadeLabelPt,
  parseParcelasCount,
} from "@/lib/crm/proposta-investimento-parcelas";
import { extensoInteiroPtBr } from "@/lib/crm/proposta-valor-brl-extenso";
import { formatBrlComExtenso, nearlyEqualMoney, parseAmount } from "./money";
import type {
  ContractInvestment,
  ContractInvestmentItem,
  ContractPayment,
  ContractPaymentMethod,
} from "./types";

/**
 * Natureza do honorário: `fixed` = valor fechado (SPOT), `recurring` = mensal
 * (inclui manutenção), `contingent` = êxito. Só `fixed` entra no total de
 * parcela única ("Proposta base").
 */
export type InvestmentItemKind = "fixed" | "recurring" | "contingent";

export function classifyInvestmentSubtype(subtipoId: string): InvestmentItemKind {
  const sub = subtipoId.trim();
  if (sub.startsWith("exito")) return "contingent";
  if (sub.startsWith("mensal") || sub.includes("manutencao")) return "recurring";
  return "fixed";
}

const PERCENTUAL_EXITO_KEYS = ["PORCENTAGEMHONORARIOS", "PERCENTUALEXITO", "PERCENTUAL"] as const;

function percentualExitoRaw(ph: Record<string, string>): string {
  for (const key of PERCENTUAL_EXITO_KEYS) {
    const v = ph[key]?.trim();
    if (v) return v;
  }
  return "";
}

/** O item tem algo que vira texto de honorários (valor ou percentual de êxito). */
export function investmentItemHasValue(item: ContractInvestmentItem): boolean {
  return (item.amount != null && item.amount > 0) || Boolean(percentualExitoRaw(item.placeholders));
}

const METHOD_PATTERNS: Array<[Exclude<ContractPaymentMethod, "combinado" | "indefinido">, RegExp]> = [
  ["boleto", /\bboletos?\b/i],
  ["pix", /\bpix\b/i],
  ["transferencia", /\btransfer[eê]ncias?\b|\bted\b|\bdep[oó]sitos?\b|\bconta\s+banc/i],
];

const METHOD_LABEL: Record<Exclude<ContractPaymentMethod, "combinado" | "indefinido">, string> = {
  boleto: "boleto bancário",
  pix: "PIX",
  transferencia: "transferência bancária",
};

/**
 * Meios de pagamento citados nas condições da proposta. Lê só o tipo de pagamento
 * e campos de pagamento/vencimento — não o texto do escopo ou da base do êxito
 * (ex.: "transferência de quotas" não é forma de pagamento).
 */
function detectPaymentMethods(
  placeholders: Record<string, string>,
  ccTipoPagamento?: string,
): Array<keyof typeof METHOD_LABEL> {
  const blob = [
    ccTipoPagamento ?? "",
    ...Object.entries(placeholders)
      .filter(([key]) => /PAGAMENTO|VENCIMENTO|FORMA/i.test(key))
      .map(([, value]) => value),
  ].join(" ");
  return METHOD_PATTERNS.filter(([, re]) => re.test(blob)).map(([method]) => method);
}

export function detectPaymentMethod(
  placeholders: Record<string, string>,
  ccTipoPagamento?: string,
): ContractPaymentMethod {
  const methods = detectPaymentMethods(placeholders, ccTipoPagamento);
  if (methods.length > 1) return "combinado";
  return methods[0] ?? "indefinido";
}

/** Texto da linha "Forma de pagamento" do contrato; vazio quando não foi informada. */
export function paymentMethodDisplay(payment: Pick<ContractPayment, "method" | "methodLabel">): string {
  if (payment.method === "indefinido") return "";
  if (payment.methodLabel?.trim()) return payment.methodLabel.trim();
  if (payment.method === "combinado") return "boleto bancário, PIX ou transferência bancária";
  return METHOD_LABEL[payment.method];
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
  const methods = detectPaymentMethods(placeholders, ccTipoPagamento);
  const method: ContractPaymentMethod =
    methods.length > 1 ? "combinado" : (methods[0] ?? "indefinido");
  const firstDueDate = firstDueDateFromPlaceholders(placeholders);
  const parts: string[] = [];
  let installmentCount: number | null = null;
  let downPayment: number | null = null;
  let arithmeticOk = true;
  let arithmeticNote: string | null = null;

  for (const item of investment.items) {
    const rendered = renderInvestmentItem(item, investment.items);
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
    methodLabel: methods.map((m) => METHOD_LABEL[m]).join(" ou "),
    // Um parágrafo por forma de honorário (fixo, manutenção, êxito…).
    clauseText: parts.join("\n"),
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

type RenderedItem = {
  text: string;
  installmentCount: number | null;
  downPayment: number | null;
  arithmeticOk: boolean;
  arithmeticNote: string | null;
};

function textOnly(text: string): RenderedItem {
  return { text, installmentCount: null, downPayment: null, arithmeticOk: true, arithmeticNote: null };
}

/** Tira pontuação final de um trecho digitado para encaixá-lo no meio da frase. */
function fragment(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/[\s.;,]+$/, "");
}

/** "5" / "5%" → "5% (cinco por cento)"; "2,5" → "2,5%"; texto livre fica como veio. */
function formatPercentual(raw: string): string {
  const t = raw.trim().replace(/\s*(%|por\s*cento)$/i, "").trim();
  if (/^\d+$/.test(t)) {
    const n = Number.parseInt(t, 10);
    return `${n}% (${extensoInteiroPtBr(n)} por cento)`;
  }
  if (/^\d+[.,]\d+$/.test(t)) return `${t.replace(".", ",")}%`;
  return fragment(raw);
}

/** "honorários de êxito de 5% (cinco por cento) sobre <base>" — `null` sem percentual. */
function exitoPercentualPhrase(ph: Record<string, string>): string | null {
  const raw = percentualExitoRaw(ph);
  if (!raw) return null;
  const pct = formatPercentual(raw);
  const base = fragment(ph.BASECALCULO).replace(/^sobre\s+/i, "");
  if (/\bsobre\b/i.test(pct)) return `honorários de êxito de ${pct}`;
  return `honorários de êxito de ${pct} sobre ${base || "o proveito econômico obtido"}`;
}

function renderExito(item: ContractInvestmentItem): RenderedItem {
  const percentual = exitoPercentualPhrase(item.placeholders);
  if (percentual) return textOnly(`Ficam previstos ${percentual}.`);
  if (item.amount != null) {
    const prazo = fragment(item.placeholders.PRAZOPAGAMENTO);
    const quando = !prazo
      ? ""
      : /^(no|na|em|até|após|a partir|dentro|ao|à)\b/i.test(prazo)
        ? `, a serem pagos ${prazo}`
        : `, a serem pagos no prazo de ${prazo}`;
    return textOnly(
      `Em caso de obtenção do resultado previsto, serão devidos honorários de êxito de ${formatBrlComExtenso(item.amount)}${quando}.`,
    );
  }
  return textOnly("Honorários de êxito conforme condições da proposta.");
}

/**
 * `[ITEM]` da manutenção aponta outro honorário da proposta ("1" = primeira forma).
 * No contrato vira a natureza desse honorário, porque a numeração da proposta não existe aqui.
 */
function describeReferencedItem(
  rawRef: string | undefined,
  items: ContractInvestmentItem[],
  self: ContractInvestmentItem,
): string {
  const ref = fragment(rawRef).replace(/^item\s+/i, "");
  if (!ref) return "";
  const target = /^\d+$/.test(ref) ? items[Number.parseInt(ref, 10) - 1] : undefined;
  if (target && target !== self) {
    const kind = classifyInvestmentSubtype(target.subtipoId);
    if (kind === "fixed") return "dos honorários fixos previstos nesta cláusula";
    if (kind === "recurring") return "dos honorários mensais previstos nesta cláusula";
    return "dos honorários de êxito previstos nesta cláusula";
  }
  return `dos honorários descritos no item ${ref} da proposta comercial`;
}

function renderManutencao(item: ContractInvestmentItem, items: ContractInvestmentItem[]): RenderedItem {
  if (item.amount == null) return textOnly("Honorários mensais de manutenção conforme condições da proposta.");
  const ref = describeReferencedItem(item.placeholders.ITEM, items, item);
  const cond = fragment(item.placeholders.CONDICAOFINAL);
  const ate = !cond
    ? ""
    : /^(até|enquanto|durante|pelo|pela|por|conforme)\b/i.test(cond)
      ? `, ${cond.charAt(0).toLowerCase()}${cond.slice(1)}`
      : `, até ${cond}`;
  const inicio = ref ? `Após a quitação ${ref}, será devido` : "Será devido";
  return textOnly(
    `${inicio} o valor mensal de ${formatBrlComExtenso(item.amount)}, a título de honorários de manutenção${ate}.`,
  );
}

function renderMensal(item: ContractInvestmentItem): RenderedItem {
  const ph = item.placeholders;
  const sub = item.subtipoId.trim();
  if (item.amount == null) return renderSemValor(item);
  const valor = formatBrlComExtenso(item.amount);

  if (sub === "mensal_variavel_hora") {
    const hora = parseAmount(ph.VALORHORA);
    const horas = fragment(ph.HORASPREVISTAS);
    const partes = [
      "Honorários mensais correspondentes às horas efetivamente demandadas no período",
      hora != null ? `à razão de ${formatBrlComExtenso(hora)} por hora trabalhada` : "",
      horas ? `estimando-se ${horas} horas mensais` : "",
      `totalizando aproximadamente ${valor}`,
    ].filter(Boolean);
    return textOnly(`${partes.join(", ")}.`);
  }
  if (sub === "mensal_escalonado") {
    const cond = fragment(ph.CONDICAOESCALONADO);
    return textOnly(`Honorários mensais de ${valor}${cond ? `, observada a seguinte condição: ${cond}` : ""}.`);
  }
  if (sub === "mensal_variavel") {
    const cond = fragment(ph.CONDICAOVARIAVEL);
    return textOnly(`Honorários mensais de ${valor}${cond ? `, conforme a seguinte condição: ${cond}` : ""}.`);
  }
  if (sub === "mensal_condicionado") {
    const cond = fragment(ph.CONDICAOVARIAVEL);
    return textOnly(
      `Honorários mensais a partir de ${valor}, podendo variar conforme demanda, escopo ou solicitações adicionais${cond ? `, nos termos da seguinte condição: ${cond}` : ""}.`,
    );
  }
  if (sub.includes("exito")) {
    const exito = exitoPercentualPhrase(ph);
    return textOnly(
      exito
        ? `Honorários mensais de ${valor}, acrescidos de ${exito}.`
        : `Honorários mensais de ${valor}. Acrescem-se honorários de êxito conforme a proposta.`,
    );
  }
  return textOnly(`Honorários mensais de ${valor}.`);
}

function renderSemValor(item: ContractInvestmentItem): RenderedItem {
  const ph = item.placeholders;
  const raw = ph[getPrimarySumKeyForSubtipo(item.subtipoId) ?? ""] ?? ph[PARCELAS_KEY] ?? "";
  return textOnly(
    raw
      ? `Condições comerciais da proposta: ${raw}.`
      : "Investimento da proposta sem valor numérico interpretável.",
  );
}

/** Valor fechado (SPOT): à vista, parcelas iguais/distintas com vencimento, ou entrada + parcelas. */
function renderFixo(item: ContractInvestmentItem): RenderedItem {
  const ph = item.placeholders;
  const amount = item.amount;
  if (amount == null) return renderSemValor(item);

  const total = `Honorários fixos de ${formatBrlComExtenso(amount)}`;
  const exito = item.subtipoId.includes("exito") ? exitoPercentualPhrase(ph) : null;
  const exitoTail = exito ? ` Acrescem-se ${exito}, caso atingido o resultado previsto.` : "";
  const parcelas = parseParcelasCount(ph);
  const entrada = parseAmount(ph.VALORENTRADA ?? ph.ENTRADA ?? "");
  const valorParcela = parseAmount(ph[VALOR_PARCELA_KEY] ?? "");

  if (entrada != null && parcelas > 0 && valorParcela != null) {
    const soma = entrada + parcelas * valorParcela;
    const ok = nearlyEqualMoney(soma, amount);
    return {
      text: `${total}, com entrada de ${formatBrlComExtenso(entrada)} e ${parcelasQuantidadeLabelPt(parcelas)} de ${formatBrlComExtenso(valorParcela)}.${exitoTail}`,
      installmentCount: parcelas,
      downPayment: entrada,
      arithmeticOk: ok,
      arithmeticNote: ok
        ? null
        : `Soma entrada + parcelas (${soma.toFixed(2)}) difere do total (${amount.toFixed(2)}).`,
    };
  }

  if (parcelas === 1) {
    const venc = normalizeParcelaVencimento(getParcelaVencimentos(ph)[0] ?? "");
    return {
      ...textOnly(`${total}, pagos em parcela única${venc ? ` ${venc}` : ""}.${exitoTail}`),
      installmentCount: 1,
    };
  }

  if (parcelas > 1 && getParcelasModo(ph) === "distintas") {
    const soma = getParcelaValues(ph).reduce((acc, raw) => acc + (parseAmount(raw) ?? 0), 0);
    const ok = nearlyEqualMoney(soma, amount);
    return {
      text: `${total}, pagos em ${parcelasQuantidadeLabelPt(parcelas)}, ${formatParcelasDistintasDetalhe(ph)}.${exitoTail}`,
      installmentCount: parcelas,
      downPayment: null,
      arithmeticOk: ok,
      arithmeticNote: ok
        ? null
        : `Soma das parcelas (${soma.toFixed(2)}) difere do total (${amount.toFixed(2)}).`,
    };
  }

  if (parcelas > 1) {
    const cada = valorParcela ?? Math.round((amount / parcelas) * 100) / 100;
    const soma = parcelas * cada;
    const ok = nearlyEqualMoney(soma, amount);
    const cronograma = formatCronogramaParcelasIguais(ph);
    const forma = cronograma
      ? `${parcelasQuantidadeLabelPt(parcelas)} iguais de ${formatBrlComExtenso(cada)}, ${cronograma}`
      : `${parcelasQuantidadeLabelPt(parcelas)} mensais e sucessivas de ${formatBrlComExtenso(cada)} cada`;
    return {
      text: `${total}, pagos em ${forma}.${exitoTail}`,
      installmentCount: parcelas,
      downPayment: null,
      arithmeticOk: ok,
      arithmeticNote: ok
        ? null
        : `Soma das parcelas (${soma.toFixed(2)}) difere do total (${amount.toFixed(2)}).`,
    };
  }

  const aVista = ph[PARCELAS_KEY]?.trim() === "0" ? ", para pagamento à vista" : "";
  return { ...textOnly(`${total}${aVista}.${exitoTail}`), downPayment: entrada };
}

function renderInvestmentItem(
  item: ContractInvestmentItem,
  items: ContractInvestmentItem[],
): RenderedItem {
  const kind = classifyInvestmentSubtype(item.subtipoId);
  if (kind === "contingent") return renderExito(item);
  if (item.subtipoId.includes("manutencao")) return renderManutencao(item, items);
  if (kind === "recurring") return renderMensal(item);
  return renderFixo(item);
}
