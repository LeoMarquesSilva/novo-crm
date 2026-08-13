import { describe, expect, it } from "vitest";
import { diceSimilarity, findSimilarExisting } from "./similarity";

describe("similarity", () => {
  it("retorna 1 para textos idênticos", () => {
    const text = "Prestação de serviços para [NOME EMPRESA] em ação cível";
    expect(diceSimilarity(text, text)).toBe(1);
  });

  it("encontra top similares acima do limiar", () => {
    const matches = findSimilarExisting(
      "Representação de [NOME EMPRESA] na ação de cobrança n. [NUMERO_PROCESSO]",
      [
        {
          id: "a",
          label: "Cobrança unitária",
          typeLabel: "Contencioso",
          template: "Defesa de [NOME EMPRESA] na cobrança sob n. [NUMERO_PROCESSO]",
        },
        {
          id: "b",
          label: "Trabalhista coletivo",
          typeLabel: "Trabalhista",
          template: "Negociação sindical e acordos coletivos",
        },
      ],
      0.3,
      3,
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].id).toBe("a");
  });
});
