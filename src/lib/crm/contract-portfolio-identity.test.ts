import { describe, expect, it } from "vitest";
import { contractPortfolioLabels } from "./contract-portfolio-identity";

describe("contractPortfolioLabels", () => {
  it("usa o grupo no título e a razão social no subtítulo", () => {
    expect(
      contractPortfolioLabels({
        groupName: "Grupo Pague Menos",
        legalName: "Pague Menos Comercio de Produtos Alimenticios Ltda",
        fallbackTitle: "LOJA 01",
      }),
    ).toEqual({
      title: "Grupo Pague Menos",
      clientName: "Pague Menos Comercio de Produtos Alimenticios Ltda",
    });
  });

  it("cai no título do contrato quando o grupo não veio", () => {
    expect(
      contractPortfolioLabels({
        groupName: null,
        legalName: "INGEVITY QUÍMICA LTDA.",
        fallbackTitle: "INGEVITY QUÍMICA LTDA.",
      }),
    ).toEqual({
      title: "INGEVITY QUÍMICA LTDA.",
      clientName: "INGEVITY QUÍMICA LTDA.",
    });
  });
});
