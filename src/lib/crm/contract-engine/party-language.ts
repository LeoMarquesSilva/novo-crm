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

export function applyPartyPlaceholders(text: string, grammar: PartyGrammar): string {
  return text
    .replaceAll("[CONTRATANTE_NOUN]", grammar.noun)
    .replaceAll("[A_CONTRATANTE]", grammar.articleNoun)
    .replaceAll("[DA_CONTRATANTE]", grammar.of)
    .replaceAll("[PELA_CONTRATANTE]", grammar.by);
}
