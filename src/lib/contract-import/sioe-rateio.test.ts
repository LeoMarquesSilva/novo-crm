import { describe, expect, it } from "vitest";
import {
  buildSioeRateioSnapshot,
  mapSioeDepartamentoToAreaKey,
  sharesFromCents,
} from "./sioe-rateio";

describe("mapSioeDepartamentoToAreaKey", () => {
  it("mapeia departamentos do VIOS para as áreas do CRM", () => {
    expect(mapSioeDepartamentoToAreaKey("Cível")).toBe("Cível");
    expect(mapSioeDepartamentoToAreaKey("Contratos")).toBe("Societário e Contratos");
    expect(mapSioeDepartamentoToAreaKey("Insolvência")).toBe("Reestruturação e Insolvência");
    expect(mapSioeDepartamentoToAreaKey("Recuperação de Crédito")).toBe("Recuperação de Créditos");
    expect(mapSioeDepartamentoToAreaKey("Cível | Insolvência")).toBeNull();
    expect(mapSioeDepartamentoToAreaKey("Financeiro")).toBeNull();
  });
});

describe("sharesFromCents", () => {
  it("fecha 100% no rateio da Ingevity", () => {
    const shares = sharesFromCents(
      new Map([
        ["Cível", 400_040],
        ["Societário e Contratos", 249_952],
        ["Trabalhista", 810_008],
      ]),
    );
    expect(shares.reduce((sum, share) => sum + share.percentageBasisPoints, 0)).toBe(10_000);
    expect(shares).toEqual([
      { areaKey: "Cível", amountCents: 400_040, percentageBasisPoints: 2_740 },
      { areaKey: "Societário e Contratos", amountCents: 249_952, percentageBasisPoints: 1_712 },
      { areaKey: "Trabalhista", amountCents: 810_008, percentageBasisPoints: 5_548 },
    ]);
  });
});

describe("buildSioeRateioSnapshot", () => {
  it("usa o título ABERTO mais recente de honorários", () => {
    const snapshot = buildSioeRateioSnapshot([
      {
        ciTitulo: 1,
        departamento: "Trabalhista",
        valorItem: 2000,
        competencia: "2026-01-15",
        situacao: "PAGO",
        planoContas: "HONORÁRIOS MENSAIS",
        descricao: "SERVIÇOS ADVOCATÍCIOS",
      },
      {
        ciTitulo: 2,
        departamento: "Cível",
        valorItem: 4000.4,
        competencia: "2026-12-15",
        situacao: "ABERTO",
        planoContas: "HONORÁRIOS MENSAIS",
        descricao: "SERVIÇOS ADVOCATÍCIOS",
      },
      {
        ciTitulo: 2,
        departamento: "Contratos",
        valorItem: 2499.52,
        competencia: "2026-12-15",
        situacao: "ABERTO",
        planoContas: "HONORÁRIOS MENSAIS",
        descricao: "SERVIÇOS ADVOCATÍCIOS",
      },
      {
        ciTitulo: 2,
        departamento: "Trabalhista",
        valorItem: 8100.08,
        competencia: "2026-12-15",
        situacao: "ABERTO",
        planoContas: "HONORÁRIOS MENSAIS",
        descricao: "SERVIÇOS ADVOCATÍCIOS",
      },
    ]);
    expect(snapshot?.ciTitulo).toBe(2);
    expect(snapshot?.totalCents).toBe(1_460_000);
    expect(snapshot?.shares.map((share) => share.areaKey)).toEqual([
      "Cível",
      "Societário e Contratos",
      "Trabalhista",
    ]);
  });
});
