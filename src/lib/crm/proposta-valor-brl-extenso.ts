/**
 * Entrada livre (CRM): aceita "1.234,56", "1234,56", "R$ 5000", etc.
 * Retorna `null` se não for um número finito.
 */
export function parseBrlUserInput(raw: string): number | null {
  const s = raw
    .replace(/R\$\s*/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm: string;
  if (lastComma > lastDot) {
    norm = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    norm = s.replace(/,/g, "");
  } else {
    norm = s.replace(/,/g, ".");
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
];
const DEZ_A_DEZENOVE = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DEZ_A_DEZENOVE[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    const base = DEZENAS[d];
    return u ? `${base} e ${UNIDADES[u]}` : base;
  }
  const c = Math.floor(n / 100);
  const rest = n % 100;
  let s = CENTENAS[c];
  if (rest) s += " e " + ate999(rest);
  return s;
}

/** Inteiros positivos; 0 devolve "zero". Suporta até centenas de bilhões (suficiente para propostas). */
export function extensoInteiroPtBr(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "zero";
  if (n < 1000) return ate999(n);

  if (n < 1_000_000) {
    const m = Math.floor(n / 1000);
    const u = n % 1000;
    const mp = m === 1 ? "mil" : `${ate999(m)} mil`;
    return u ? `${mp} e ${ate999(u)}` : mp;
  }

  const milhoes = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const hp = milhoes === 1 ? "um milhão" : `${extensoInteiroPtBr(milhoes)} milhões`;
  if (!rest) return hp;
  return `${hp} e ${extensoInteiroPtBr(rest)}`;
}

/** Valor monetário em reais por extenso (reais e centavos). */
export function valorReaisPorExtensoPtBr(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  const centavos = Math.round(valor * 100);
  const reais = Math.floor(centavos / 100);
  const c = centavos % 100;

  if (reais === 0 && c === 0) return "zero real";

  if (reais === 0) {
    return `${extensoInteiroPtBr(c)}${c === 1 ? " centavo" : " centavos"}`;
  }

  let s =
    extensoInteiroPtBr(reais) + (reais === 1 ? " real" : " reais");
  if (c > 0) {
    s += ` e ${extensoInteiroPtBr(c)}${c === 1 ? " centavo" : " centavos"}`;
  }
  return s;
}

/** Parte numérica pt-BR (sem símbolo R$), sempre com 2 casas decimais. */
export function formatNumberPtBr2(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Exibe valor monetário no input com prefixo `R$` e máscara pt-BR. */
export function displayBrlCurrencyField(stored: string): string {
  const t = stored.trim();
  if (!t) return "";
  const n = parseBrlUserInput(t);
  if (n != null) return `R$ ${formatNumberPtBr2(n)}`;
  const digits = t.replace(/\D/g, "");
  if (!digits) return t;
  return `R$ ${formatNumberPtBr2(Number(digits) / 100)}`;
}

/**
 * Máscara enquanto digita (centavos à direita): `1` → `R$ 0,01`, `1720000` → `R$ 17.200,00`.
 * Valor salvo permanece parseável por `parseBrlUserInput`.
 */
export function maskBrlCurrencyFromInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (!digits) return "";
  return `R$ ${formatNumberPtBr2(Number(digits) / 100)}`;
}
