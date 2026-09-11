/**
 * Padroniza títulos de cláusulas/objeto em Title Case (pt-BR): primeira letra de
 * cada palavra maiúscula, exceto conectivos (artigos, preposições, "não", "e"/"ou")
 * quando não são a primeira palavra — ex.: "Atos Jurídicos Excluídos",
 * "Demandas não Contempladas". Siglas/acrônimos (ex.: "NR-1", "ICMS") são
 * preservados como estão.
 */

const LOWERCASE_WORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "para",
  "com",
  "sem",
  "sob",
  "sobre",
  "entre",
  "e",
  "ou",
  "não",
  "ao",
  "aos",
  "à",
  "às",
]);

const BOUNDARY_TOKENS = new Set(["—", "-", "–", ":"]);

function isAcronym(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  if (isAcronym(word)) return word;
  const match = word.match(/\p{L}/u);
  if (!match || match.index === undefined) return word;
  const idx = match.index;
  return (
    word.slice(0, idx) +
    word.charAt(idx).toLocaleUpperCase("pt-BR") +
    word.slice(idx + 1).toLocaleLowerCase("pt-BR")
  );
}

export function toTitleCasePt(title: string): string {
  if (!title) return title;
  const tokens = title.split(/(\s+)/);
  let wordIndex = 0;
  let forceCapNext = true;
  const result: string[] = [];

  for (const token of tokens) {
    if (token === "" || /^\s+$/.test(token)) {
      result.push(token);
      continue;
    }
    if (BOUNDARY_TOKENS.has(token)) {
      result.push(token);
      forceCapNext = true;
      continue;
    }

    const isFirst = wordIndex === 0;
    const lower = token.toLocaleLowerCase("pt-BR");
    if (!isFirst && !forceCapNext && LOWERCASE_WORDS.has(lower)) {
      result.push(lower);
    } else {
      result.push(capitalizeWord(token));
    }
    wordIndex += 1;
    forceCapNext = false;
  }

  return result.join("");
}
