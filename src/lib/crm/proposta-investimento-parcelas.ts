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

function parcelasQuantidadeLabelPt(count: number): string {
  return PARCELAS_QUANTIDADE_EXTENSO[count] ?? `${count} parcelas`;
}

function parcelaOrdemAdjetivo(index: number): string {
  return PARCELA_ORDEM_ADJETIVO[index] ?? `${index + 1}ª`;
}

/** Normaliza texto de vencimento (aceita frase completa ou só o complemento). */
export function formatParcelaVencimentoSuffix(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^(na|no|em|até|aos?)\s/i.test(t)) return ` ${t}`;
  return ` na ${t}`;
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

function parcelasTemVencimentosCompletos(placeholders: Record<string, string>): boolean {
  const count = parseParcelasCount(placeholders);
  if (count < 1) return false;
  const vencimentos = getParcelaVencimentos(placeholders);
  return vencimentos.length >= count && vencimentos.slice(0, count).every((v) => v.trim());
}

function formatParcelasComVencimentos(placeholders: Record<string, string>): string {
  const count = parseParcelasCount(placeholders);
  const values = getParcelaValues(placeholders);
  const vencimentos = getParcelaVencimentos(placeholders);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const val = formatInvestimentoCurrencyForMerge(values[i] ?? "");
    const cond = formatParcelaVencimentoSuffix(vencimentos[i] ?? "");
    const ord = parcelaOrdemAdjetivo(i);
    if (i === 0) {
      parts.push(`sendo a ${ord} no valor de R$ ${val}${cond}`);
    } else {
      parts.push(`e a ${ord} no valor de R$ ${val}${cond}`);
    }
  }
  return `a serem pagos em ${parcelasQuantidadeLabelPt(count)}, ${parts.join(" ")}`;
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

  const clause = formatValorParcelaPlaceholderForMerge(placeholders);
  return `para pagamento à vista ou, ainda, em até ${count} parcelas mensais e sucessivas de R$ ${clause}`;
}

/** Texto que substitui `[VALORPARCELA]` no modelo (à vista + parcelas iguais ou distintas). */
export function formatValorParcelaPlaceholderForMerge(placeholders: Record<string, string>): string {
  const count = parseParcelasCount(placeholders);
  if (count < 1) return formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "");

  if (parcelasTemAlgumVencimento(placeholders)) {
    return formatParcelasComVencimentos(placeholders);
  }

  if (getParcelasModo(placeholders) === "iguais") {
    return formatInvestimentoCurrencyForMerge(placeholders[VALOR_PARCELA_KEY] ?? "");
  }

  const values = getParcelaValues(placeholders);
  return values
    .map((v, i) => {
      const formatted = formatInvestimentoCurrencyForMerge(v);
      const ord = i + 1;
      if (i === 0) return `${formatted} na ${ord}ª parcela`;
      return `R$ ${formatted} na ${ord}ª parcela`;
    })
    .join(", ");
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
