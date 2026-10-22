/**
 * O RD guarda mais de um cliente no mesmo campo ("305.191.268-90, 168.378.308-56",
 * "Fulano / Beltrano", dois e-mails). Estas funções separam os valores; a migração só
 * pré-preenche um campo de valor único quando o RD tem exatamente um valor válido.
 */

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allSameDigit(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allSameDigit(d)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

export function isValidCpfOrCnpj(value: string): boolean {
  return isValidCpf(value) || isValidCnpj(value);
}

/** CNPJ (com ou sem pontuação) ou CPF; sem dígitos colados antes/depois. */
const DOCUMENT_RE = /(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;

export type FoundDocument = { digits: string; start: number; end: number };

/** Documentos válidos do texto, na ordem, sem repetição (digitação errada fica de fora). */
export function findDocuments(text: string): FoundDocument[] {
  const out: FoundDocument[] = [];
  for (const match of text.matchAll(DOCUMENT_RE)) {
    const digits = onlyDigits(match[1]);
    if (!isValidCpfOrCnpj(digits) || out.some((d) => d.digits === digits)) continue;
    const start = match.index ?? 0;
    out.push({ digits, start, end: start + match[0].length });
  }
  return out;
}

export function extractDocuments(text: string): string[] {
  return findDocuments(text).map((d) => d.digits);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

/** Separadores de lista que o RD usa entre pessoas: vírgula, ponto e vírgula, barra com espaços, quebra de linha. */
const LIST_SEPARATOR_RE = /\s*(?:;|,|\n|\s\/\s|\s\/|\/\s)\s*/;

/** "VINICIUS …, ANDRÉ …" → ["VINICIUS …", "ANDRÉ …"]. Um valor só volta como lista de um. */
export function splitPeopleNames(text: string): string[] {
  return text
    .split(LIST_SEPARATOR_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Telefones do texto (cada um com DDD: 10 ou 11 dígitos). */
export function extractPhones(text: string): string[] {
  return text
    .split(/\s*(?:;|,|\n|\/|\se\s)\s*/)
    .map((s) => s.trim())
    .filter((s) => {
      const d = onlyDigits(s);
      return d.length >= 10 && d.length <= 13;
    });
}

function cleanPartyName(raw: string): string {
  return raw
    .replace(/\b(?:CPF\/CNPJ|CPF|CNPJ|inscrit[oa] no|portador[a]? do)\b/gi, " ")
    .replace(/\bn(?:º|°|o\.|r\.?|\.)/gi, " ")
    .replace(/[º°]/g, " ")
    .replace(/[,;:/()\-–—|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pares nome + documento de um texto livre ("FULANO, CPF 305.191.268-90 / BELTRANO, CPF 168…").
 * Se o texto começa por um nome, cada nome vem antes do seu documento; senão, depois.
 */
export function extractParties(text: string): Array<{ nome: string; documento: string }> {
  const docs = findDocuments(text);
  if (docs.length === 0) return [];
  const namesBefore = cleanPartyName(text.slice(0, docs[0].start)).length > 0;
  return docs.map((doc, i) => ({
    nome: namesBefore
      ? cleanPartyName(text.slice(i === 0 ? 0 : docs[i - 1].end, doc.start))
      : cleanPartyName(text.slice(doc.end, docs[i + 1]?.start ?? text.length)),
    documento: doc.digits,
  }));
}

/** CEPs do texto (8 dígitos, com ou sem pontuação). */
export function extractCeps(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<!\d)(\d{2})\.?(\d{3})-?(\d{3})(?!\d)/g)) {
    const cep = `${m[1]}${m[2]}${m[3]}`;
    if (!out.includes(cep)) out.push(cep);
  }
  return out;
}
