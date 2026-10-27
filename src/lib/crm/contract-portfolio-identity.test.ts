import { describe, expect, it } from "vitest";
import {
  contractPortfolioLabels,
  sameContractLabel,
  withoutRepeatedNames,
} from "./contract-portfolio-identity";

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

describe("withoutRepeatedNames", () => {
  it("mostra uma vez a razão social repetida de matriz e filial", () => {
    expect(
      withoutRepeatedNames(
        "EXTRUTECH INDUSTRIA DE PERFIL DE ALUMINIO S/A, EXTRUTECH INDUSTRIA DE PERFIL DE ALUMINIO S/A",
      ),
    ).toBe("EXTRUTECH INDUSTRIA DE PERFIL DE ALUMINIO S/A");
    expect(withoutRepeatedNames("Alfa Ltda; alfa  ltda, Beta S/A")).toBe("Alfa Ltda, Beta S/A");
    expect(withoutRepeatedNames("VINICIUS, ANDRÉ")).toBe("VINICIUS, ANDRÉ");
    expect(withoutRepeatedNames(null)).toBe("");
  });

  it("aplica nos rótulos da carteira", () => {
    expect(
      contractPortfolioLabels({
        groupName: null,
        legalName: "EXTRUTECH S/A, EXTRUTECH S/A",
        fallbackTitle: "EXTRUTECH S/A, EXTRUTECH S/A",
      }),
    ).toEqual({ title: "EXTRUTECH S/A", clientName: "EXTRUTECH S/A" });
  });
});

describe("sameContractLabel", () => {
  it("reconhece o mesmo nome com espaço e caixa diferentes", () => {
    expect(sameContractLabel("VINICIUS, ANDRÉ", " vinicius,  andré ")).toBe(true);
    expect(sameContractLabel("Grupo Pague Menos", "Pague Menos Ltda")).toBe(false);
    expect(sameContractLabel("", "")).toBe(false);
  });
});
