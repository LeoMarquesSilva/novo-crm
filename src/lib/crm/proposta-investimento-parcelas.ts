import {
  formatNumberPtBr2,
  parseBrlUserInput,
  valorReaisPorExtensoPtBr,
} from "@/lib/crm/proposta-valor-brl-extenso";

export const PARCELAS_KEY = "PARCELAS";
export const VALOR_PARCELA_KEY = "VALORPARCELA";
/** `sim` = mesmo valor em todas; `nao` = valor por parcela. */
export const PARCELAS_IGUAIS_KEY = "PARCELAS_IGUAIS";
/** Valores brutos separados por `|` (mesmo formato de entrada do CRM). */
export const PARCELAS_VALORES_KEY = "PARCELAS_VALORES";
/** Condição/vencimento de cada parcela (ex.: `na data de assinatura do Contrato`), separado por `|`. */
export const PARCELAS_VENCIMENTOS_KEY = "PARCELAS_VENCIMENTOS";
/** Substituído no modelo Word pelo trecho completo de pagamento (à vista ou parcelas detalhadas). */
export const DETALHE_PARCELAS_KEY = "DETALHEPARCELAS";

export type ParcelasModo = "iguais" | "distintas";

const PARCELAS_QUANTIDADE_EXTENSO: Record<number, string> = {
  1: "uma parcela",
  2: "duas parcelas",
  3: "três parcelas",
  4: "quatro parcelas",
  5: "cinco parcelas",
  6: "seis parcelas",
  7: "sete parcelas",
  8: "oito parcelas",
  9: "nove parcelas",
  10: "dez parcelas",
  11: "onze parcelas",
  12: "doze parcelas",
};

const PARCELA_ORDEM_ADJETIVO = [
  "primeira",
  "segunda",
  "terceira",
  "quarta",
  "quinta",
  "sexta",
  "sétima",
  "oitava",
  "nona",
  "décima",
  "décima primeira",
  "décima segunda",
] as const;

export function investmentSubtypeHasParcelas(placeholderKeys: string[]): boolean {
  const set = new Set(placeholderKeys.map((k) => k.trim()));
  if (set.has(DETALHE_PARCELAS_KEY) && set.has("VALORSPOT")) return true;
  return set.has(PARCELAS_KEY) && set.has(VALOR_PARCELA_KEY);
}

export function isParcelasMetaKey(key: string): boolean {
  const k = key.trim();
  return (
    k === PARCELAS_IGUAIS_KEY ||
    k === PARCELAS_VALORES_KEY ||
    k === PARCELAS_VENCIMENTOS_KEY ||
    k === DETALHE_PARCELAS_KEY
  );
}

export function getParcelasModo(placeholders: Record<string, string>): ParcelasModo {
  return placeholders[PARCELAS_IGUAIS_KEY]?.trim().toLowerCase() === "nao" ? "distintas" : "iguais";
}

export function parseParcelasCount(placeholders: Record<string, string>): number {
  const n = Number.parseInt(String(placeholders[PARCELAS_KEY] ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Valor de cada parcela (modo iguais) = VALORSPOT ÷ número de parcelas. */
export function computeValorParcelaIgual(
  placeholders: Record<string, string>,
  count: number,
): string | null {
  if (count <= 0) return null;
  const spot = parseBrlUserInput(placeholders.VALORSPOT ?? "");
  if (spot == null || spot <= 0) return null;
  const parcel = Math.round((spot / count) * 100) / 100;
  return formatNumberPtBr2(parcel);
}

/** Separador de listas serializadas (vencimentos); evita conflito com `|` no texto. */
export const PARCELAS_LIST_SEP = "\u001e";

export function parseParcelasValoresRaw(raw: string): string[] {
  if (!raw.trim()) return [];
  const sep = raw.includes(PARCELAS_LIST_SEP) ? PARCELAS_LIST_SEP : "|";
  return raw.split(sep).map((s) => s.trim());
}

export function encodeParcelasList(items: string[]): string {
  return items.map((s) => s.replaceAll(PARCELAS_LIST_SEP, " ")).join(PARCELAS_LIST_SEP);
}

export function decodeParcelasList(raw: string, preserveInnerSpaces = false): string[] {
  if (!raw) return [];
  const sep = raw.includes(PARCELAS_LIST_SEP) ? PARCELAS_LIST_SEP : "|";
  const parts = raw.split(sep);
  if (preserveInnerSpaces) {
    return parts.map((s) => s.replaceAll(PARCELAS_LIST_SEP, " "));
  }
  return parts.map((s) => s.trim());
}

export function getParcelaValues(placeholders: Record<string, string>): string[] {
  const count = parseParcelasCount(placeholders);
  if (count <= 0) return [];
  if (getParcelasModo(placeholders) === "iguais") {
    const v = placeholders[VALOR_PARCELA_KEY]?.trim() ?? "";
    return v ? Array.from({ length: count }, () => v) : [];
  }
  const fromPipe = parseParcelasValoresRaw(placeholders[PARCELAS_VALORES_KEY] ?? "");
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(fromPipe[i] ?? "");
  return out;
}

export function getParcelaVencimentos(placeholders: Record<string, string>): string[] {
  const count = parseParcelasCount(placeholders);
  if (count <= 0) return [];
  const fromPipe = decodeParcelasList(placeholders[PARCELAS_VENCIMENTOS_KEY] ?? "", true);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(fromPipe[i] ?? "");
  return out;
}

function parcelasTemAlgumVencimento(placeholders: Record<string, string>): boolean {
  return getParcelaVencimentos(placeholders).some((v) => v.trim().length > 0);
}

/** "cinco parcelas", "duas parcelas" (até doze; acima disso, número). */
export function parcelasQuantidadeLabelPt(count: number): string {
  return PARCELAS_QUANTIDADE_EXTENSO[count] ?? `${count} parcelas`;
}

function parcelaOrdemAdjetivo(index: number): string {
  return PARCELA_ORDEM_ADJETIVO[index] ?? `${index + 1}ª`;
}

/** Começo que já encaixa depois de "vencendo a primeira" / "vencível" (preposição, prazo ou locução). */
const VENCIMENTO_JA_REDIGIDO_RE =
  /^(na|no|nas|nos|em|até|ao|aos|à|às|após|depois|a partir|antes|dentro|mediante|quando|conforme|com|contra|por ocasião|juntamente|todo|toda|sempre|\d+\s*(dias?|mês|mes|meses|semanas?|anos?)\b)/i;
const VENCIMENTO_DATA_RE = /^(\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|\d{4}-\d{2}-\d{2})$/;
const VENCIMENTO_FEMININO_RE =
  /^(data|assinatura|entrega|conclusão|conclusao|aprovação|aprovacao|emissão|emissao|protocolização|protocolizacao|distribuição|distribuicao|homologação|homologacao|sentença|sentenca|audiência|audiencia|primeira|segunda|terceira|última|ultima)\b/i;
const VENCIMENTO_MASCULINO_RE =
  /^(dia|ato|mês|mes|prazo|término|termino|encerramento|protocolo|fim|final|início|inicio|primeiro|segundo|último|ultimo|pagamento|vencimento|recebimento|trânsito|transito)\b/i;

/**
 * Vencimento digitado na parcela → trecho que encaixa depois de "vencendo a primeira"
 * ou "vencível": mantém frase já redigida ("na data de assinatura", "30 dias após a
 * 1ª parcela"), põe "em" antes de data e "na"/"no" antes de substantivo solto.
 */
export function normalizeParcelaVencimento(raw: string): string {
  const t = raw.trim().replace(/[\s.;,]+$/, "");
  if (!t) return "";
  const lowerFirst = (v: string) => v.charAt(0).toLowerCase() + v.slice(1);
  if (VENCIMENTO_JA_REDIGIDO_RE.test(t)) return /^\d/.test(t) ? t : lowerFirst(t);
  if (VENCIMENTO_DATA_RE.test(t)) return `em ${t}`;
  if (VENCIMENTO_FEMININO_RE.test(t)) return `na ${lowerFirst(t)}`;
  if (VENCIMENTO_MASCULINO_RE.test(t)) return `no ${lowerFirst(t)}`;
  return t;
}

/** Mesmo texto de `normalizeParcelaVencimento`, com espaço à esquerda (vazio quando não há). */
export function formatParcelaVencimentoSuffix(raw: string): string {
  const t = normalizeParcelaVencimento(raw);
  return t ? ` ${t}` : "";
}

/** "a", "a e b", "a, b e c"; `serialComma` põe vírgula antes do "e" (itens que já têm vírgula). */
function joinListaPt(items: string[], serialComma = false): string {
  if (items.length <= 1) return items[0] ?? "";
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")}${serialComma ? "," : ""} e ${last}`;
}

/** "vencendo a primeira na data de assinatura do Contrato, a segunda 30 dias após…" (só as preenchidas). */
export function formatCronogramaParcelasIguais(placeholders: Record<string, string>): string {
  const partes = getParcelaVencimentos(placeholders)
    .map((raw, i) => {
      const venc = normalizeParcelaVencimento(raw);
      return venc ? `a ${parcelaOrdemAdjetivo(i)} ${venc}` : "";
    })
    .filter(Boolean);
  return partes.length > 0 ? `vencendo ${joinListaPt(partes)}` : "";
}

/** "sendo a primeira no valor de R$ X, vencível …, e a segunda no valor de R$ Y, vencível …". */
export function formatParcelasDistintasDetalhe(placeholders: Record<string, string>): string {
  const vencimentos = getParcelaVencimentos(placeholders);
  let algumVencimento = false;
  const partes = getParcelaValues({ ...placeholders, [PARCELAS_IGUAIS_KEY]: "nao" }).map((raw, i) => {
    const val = formatInvestimentoCurrencyForMerge(raw);
    const venc = normalizeParcelaVencimento(vencimentos[i] ?? "");
    if (venc) algumVencimento = true;
    return `a ${parcelaOrdemAdjetivo(i)}${val ? ` no valor de R$ ${val}` : ""}${venc ? `, vencível ${venc}` : ""}`;
  });
  return partes.length > 0 ? `sendo ${joinListaPt(partes, algumVencimento)}` : "";
}

export function buildParcelasPlaceholdersPatch(
  placeholders: Record<string, string>,
  patch: {
    count?: number;
    modo?: ParcelasModo;
    valorIgual?: string;
    valoresDistintos?: string[];
    vencimentos?: string[];
  },
): Record<string, string> {
  const next = { ...placeholders };
  const count =
    patch.count !== undefined ? Math.max(0, Math.floor(patch.count)) : parseParcelasCount(next);
  const modo = patch.modo ?? getParcelasModo(next);

  if (patch.count !== undefined) {
    next[PARCELAS_KEY] = count > 0 ? String(count) : "";
  }

  next[PARCELAS_IGUAIS_KEY] = modo === "iguais" ? "sim" : "nao";

  if (modo === "iguais") {
    if (patch.valorIgual !== undefined) next[VALOR_PARCELA_KEY] = patch.valorIgual;
    if (patch.valoresDistintos) {
      const v = patch.valoresDistintos[0] ?? next[VALOR_PARCELA_KEY] ?? "";
      next[VALOR_PARCELA_KEY] = v;
    }
    delete next[PARCELAS_VALORES_KEY];
  } else {
    const vals =
      patch.valoresDistintos ??
      getParcelaValues({ ...next, [PARCELAS_IGUAIS_KEY]: "nao" });
    const sized = Array.from({ length: count }, (_, i) => vals[i] ?? "");
    next[PARCELAS_VALORES_KEY] = encodeParcelasList(sized);
    if (sized[0]) next[VALOR_PARCELA_KEY] = sized[0];
  }

  if (patch.vencimentos !== undefined) {
    const sized = Array.from({ length: count }, (_, i) => patch.vencimentos![i] ?? "");
    if (sized.some((v) => v.trim())) {
      next[PARCELAS_VENCIMENTOS_KEY] = encodeParcelasList(sized);
    } else {
      delete next[PARCELAS_VENCIMENTOS_KEY];
    }
  } else if (patch.count !== undefined) {
    const cur = getParcelaVencimentos(next);
    const sized = Array.from({ length: count }, (_, i) => cur[i] ?? "");
    if (sized.some((v) => v.trim())) {
      next[PARCELAS_VENCIMENTOS_KEY] = encodeParcelasList(sized);
    } else {
      delete next[PARCELAS_VENCIMENTOS_KEY];
    }
  }

  return next;
}

export function formatInvestimentoCurrencyForMerge(raw: string): string {
  const n = parseBrlUserInput(String(raw));
  if (n == null) return String(raw).trim();
  const numPart = formatNumberPtBr2(n);
  const ex = valorReaisPorExtensoPtBr(n);
  return `${numPart} (${ex})`;
}

function formatParcelasComVencimentos(placeholders: Record<string, string>): string {
  const count = parseParcelasCount(placeholders);
  if (count === 1) {
    const venc = normalizeParcelaVencimento(getParcelaVencimentos(placeholders)[0] ?? "");
    return `a serem pagos em parcela única${venc ? ` ${venc}` : ""}`;
  }
  if (getParcelasModo(placeholders) === "iguais") {
    const val = formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "");
    const cronograma = formatCronogramaParcelasIguais(placeholders);
    return `a serem pagos em ${parcelasQuantidadeLabelPt(count)} iguais${val ? ` de R$ ${val}` : ""}${cronograma ? `, ${cronograma}` : ""}`;
  }
  return `a serem pagos em ${parcelasQuantidadeLabelPt(count)}, ${formatParcelasDistintasDetalhe(placeholders)}`;
}

/** Trecho de pagamento para `[DETALHEPARCELAS]` (à vista ou parcelas com vencimento). */
export function formatDetalheParcelasForMerge(placeholders: Record<string, string>): string {
  const count = parseParcelasCount(placeholders);
  if (count < 1) return "para pagamento à vista";

  if (parcelasTemAlgumVencimento(placeholders)) {
    return formatParcelasComVencimentos(placeholders);
  }

  if (getParcelasModo(placeholders) === "iguais") {
    const val = formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "");
    return `para pagamento à vista ou, ainda, em até ${count} parcelas mensais e sucessivas de R$ ${val} cada`;
  }

  return `para pagamento à vista ou, ainda, em ${parcelasQuantidadeLabelPt(count)} mensais e sucessivas, ${formatParcelasDistintasDetalhe(placeholders)}`;
}

/**
 * Texto que substitui `[VALORPARCELA]` num modelo que já traz `R$ ` antes do colchete
 * (modelo do catálogo fora do padrão reconhecido por `normalizeParcelasTemplate`).
 * `cada`: o modelo tinha " cada" logo depois do colchete (consumido pelo chamador).
 */
export function formatValorParcelaPlaceholderForMerge(
  placeholders: Record<string, string>,
  opts: { cada?: boolean } = {},
): string {
  const count = parseParcelasCount(placeholders);
  const cada = opts.cada ? " cada" : "";
  if (count < 1) return `${formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "")}${cada}`;

  if (getParcelasModo(placeholders) === "iguais") {
    const val = formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "");
    const cronograma = formatCronogramaParcelasIguais(placeholders);
    return `${val}${cada}${cronograma ? `, ${cronograma}` : ""}`;
  }

  const vencimentos = getParcelaVencimentos(placeholders);
  let algumVencimento = false;
  const partes = getParcelaValues(placeholders).map((v, i) => {
    const formatted = formatInvestimentoCurrencyForMerge(v);
    const venc = normalizeParcelaVencimento(vencimentos[i] ?? "");
    if (venc) algumVencimento = true;
    return `${i === 0 ? "" : "R$ "}${formatted} na ${i + 1}ª parcela${venc ? `, vencível ${venc}` : ""}`;
  });
  return joinListaPt(partes, algumVencimento);
}

/**
 * Trecho antigo do catálogo (SPOT e SPOT condicionado no banco):
 * "para pagamento à vista ou, ainda, em até [PARCELAS] parcelas mensais e sucessivas de R$ [VALORPARCELA]".
 * Com parcelas com vencimento ou valores distintos, a troca isolada de `[VALORPARCELA]`
 * gera "de R$ a serem pagos em…"; por isso o trecho inteiro vira `[DETALHEPARCELAS]`.
 */
const TRECHO_PARCELAS_LEGADO_RE =
  /para\s+pagamento\s+à\s+vista\s+ou,?\s*(?:ainda,?\s*)?em\s+até\s+\[PARCELAS\]\s+parcelas\s+mensais\s+e\s+sucessivas\s+de\s+R\$\s*\[VALORPARCELA\](?:\s+cada\b)?/giu;

/**
 * Troca o trecho legado de parcelas por `[DETALHEPARCELAS]` quando `PARCELAS` tem número
 * (inclusive 0 = à vista). Sem número (ex.: preview do catálogo com exemplos) o modelo fica igual.
 */
export function normalizeParcelasTemplate(
  template: string,
  placeholders: Record<string, string>,
): string {
  if (!/^\d+$/.test(String(placeholders[PARCELAS_KEY] ?? "").trim())) return template;
  return template.replace(TRECHO_PARCELAS_LEGADO_RE, `[${DETALHE_PARCELAS_KEY}]`);
}

export function validateParcelasPlaceholders(placeholders: Record<string, string>): boolean {
  const countRaw = placeholders[PARCELAS_KEY]?.trim() ?? "";
  if (!countRaw) return false;
  const count = parseParcelasCount(placeholders);
  if (count < 1) return true;

  if (getParcelasModo(placeholders) === "iguais") {
    return parseBrlUserInput(placeholders[VALOR_PARCELA_KEY] ?? "") != null;
  }

  const values = getParcelaValues(placeholders);
  if (values.length !== count) return false;
  if (!values.every((v) => parseBrlUserInput(v) != null)) return false;

  const vencimentos = getParcelaVencimentos(placeholders);
  return vencimentos.length >= count && vencimentos.slice(0, count).every((v) => v.trim());
}
