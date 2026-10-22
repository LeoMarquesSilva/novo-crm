export type PartyGrammar = {
  noun: "CONTRATANTE" | "CONTRATANTES";
  article: "a" | "as";
  articleNoun: "a CONTRATANTE" | "as CONTRATANTES";
  of: "da CONTRATANTE" | "das CONTRATANTES";
  by: "pela CONTRATANTE" | "pelas CONTRATANTES";
  plural: boolean;
};

export function contractPartyGrammar(contratanteCount: number): PartyGrammar {
  const plural = contratanteCount > 1;
  if (plural) {
    return {
      noun: "CONTRATANTES",
      article: "as",
      articleNoun: "as CONTRATANTES",
      of: "das CONTRATANTES",
      by: "pelas CONTRATANTES",
      plural: true,
    };
  }
  return {
    noun: "CONTRATANTE",
    article: "a",
    articleNoun: "a CONTRATANTE",
    of: "da CONTRATANTE",
    by: "pela CONTRATANTE",
    plural: false,
  };
}

/** `{prestará|prestarão}` → forma do singular ou do plural (verbos e pronomes que concordam com a contratante). */
export function resolvePartyAlternatives(text: string, plural: boolean): string {
  return text.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_, singular: string, pluralForm: string) =>
    plural ? pluralForm : singular,
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function applyPartyPlaceholders(text: string, grammar: PartyGrammar): string {
  const crase = grammar.plural ? "às CONTRATANTES" : "à CONTRATANTE";
  return resolvePartyAlternatives(text, grammar.plural)
    // No começo da frase o artigo vai em maiúscula ("As CONTRATANTES prestarão…").
    .replace(/(^|[.!?:]\s+)\[A_CONTRATANTE\]/g, (_, before: string) => `${before}${capitalize(grammar.articleNoun)}`)
    .replaceAll("[CONTRATANTE_NOUN]", grammar.noun)
    .replaceAll("[A_CONTRATANTE]", grammar.articleNoun)
    .replaceAll("[À_CONTRATANTE]", crase)
    .replaceAll("[DA_CONTRATANTE]", grammar.of)
    .replaceAll("[PELA_CONTRATANTE]", grammar.by);
}
