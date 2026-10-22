import { describe, expect, it } from "vitest";

import {
  billableUsageQuantity,
  nextCompetencyMonth,
  projectMonthlyRuns,
  projectMonthlyTotalCents,
  projectVariableAmountCents,
  usageQuantityForKind,
  type VariableUsageSnapshot,
} from "./variable-usage-projection";

const pagueMenosUsage: VariableUsageSnapshot = {
  competency: "2026-09-01",
  foldersTotal: 850,
  hoursTotal: 338.15,
  foldersByArea: { Trabalhista: 850 },
  hoursByArea: { Trabalhista: 338.15 },
};

describe("billableUsageQuantity", () => {
  it("cobra a quantidade total de pastas", () => {
    expect(billableUsageQuantity("quantidade_total", 745, 850)).toBe(850);
  });

  it("cobra só o excedente de horas acima da franquia", () => {
    expect(billableUsageQuantity("excedente", 25, 338.15)).toBeCloseTo(313.15);
  });
});

describe("projectVariableAmountCents", () => {
  it("projeta Pague Menos por pasta ativa do SIOE, sem usar 745×R$85 como mensalidade", () => {
    expect(
      projectVariableAmountCents({
        unitAmountCents: 8500,
        chargeMode: "quantidade_total",
        includedQuantity: 745,
        actualQuantity: 850,
      }),
    ).toBe(7_225_000);
  });

  it("projeta horas excedentes com quantidade decimal do timesheet", () => {
    expect(
      projectVariableAmountCents({
        unitAmountCents: 10_000,
        chargeMode: "excedente",
        includedQuantity: 25,
        actualQuantity: 338.15,
      }),
    ).toBe(3_131_500);
  });
});

describe("usageQuantityForKind", () => {
  it("usa a área do componente quando o SIOE tem pastas naquela área", () => {
    expect(usageQuantityForKind("variavel_processo", "Trabalhista", pagueMenosUsage)).toBe(850);
    expect(usageQuantityForKind("variavel_hora", "Trabalhista", pagueMenosUsage)).toBe(338.15);
  });

  it("não mistura pastas de outra área quando o componente tem área", () => {
    expect(usageQuantityForKind("variavel_processo", "trabalhista", pagueMenosUsage)).toBe(850);
    expect(usageQuantityForKind("variavel_processo", "Cível", pagueMenosUsage)).toBe(0);
    expect(usageQuantityForKind("variavel_processo", null, pagueMenosUsage)).toBe(850);
  });
});

describe("projectMonthlyTotalCents", () => {
  it("soma fixo + variável × SIOE", () => {
    const areaKeyById = new Map([["area-trab", "Trabalhista"]]);
    expect(
      projectMonthlyTotalCents(
        [
          { kind: "mensal_fixo", amountCents: "100000" },
          {
            kind: "variavel_processo",
            areaId: "area-trab",
            chargeMode: "quantidade_total",
            includedQuantity: 745,
            unitAmountCents: "8500",
          },
        ],
        areaKeyById,
        pagueMenosUsage,
      ),
    ).toBe(7_325_000);
  });
});

describe("nextCompetencyMonth", () => {
  it("avança setembro para outubro", () => {
    expect(nextCompetencyMonth("2026-09-01")).toBe("2026-10-01");
  });
});

describe("projeção por competência (teste E2E 18/10/2026)", () => {
  const components = [
    {
      kind: "mensal_preco_fechado",
      effectiveFrom: "2026-10-18",
      effectiveTo: null,
      installments: ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"].map((competency) => ({
        competency,
        amountCents: "240000",
      })),
    },
    { kind: "manutencao", effectiveFrom: "2027-03-01", effectiveTo: null, amountCents: "25000" },
    { kind: "exito_percentual", effectiveFrom: "2026-10-18", effectiveTo: null },
  ];
  const noAreas = new Map<string, string>();

  it("não soma a manutenção antes do início nem parcela fora do mês", () => {
    expect(projectMonthlyTotalCents(components, noAreas, null, "2026-10-01")).toBe(240_000);
    expect(projectMonthlyTotalCents(components, noAreas, null, "2027-02-01")).toBe(240_000);
    expect(projectMonthlyTotalCents(components, noAreas, null, "2027-03-01")).toBe(25_000);
    expect(projectMonthlyTotalCents(components, noAreas, null, "2026-09-01")).toBe(0);
  });

  it("agrupa os meses em trechos de mesmo valor", () => {
    expect(projectMonthlyRuns(components, noAreas, null, "2026-10-01", 12)).toEqual([
      { from: "2026-10-01", to: "2027-02-01", cents: 240_000 },
      { from: "2027-03-01", to: null, cents: 25_000 },
    ]);
  });
});

describe("projeção da mensalidade que começa no meio do mês", () => {
  const components = [{ kind: "mensal_fixo", effectiveFrom: "2026-10-18", effectiveTo: null, amountCents: "100000" }];
  const noAreas = new Map<string, string>();

  it("segue a escolha do Financeiro, como o fechamento", () => {
    expect(projectMonthlyRuns(components, noAreas, null, "2026-10-01", 3, "mes_cheio")).toEqual([
      { from: "2026-10-01", to: null, cents: 100_000 },
    ]);
    expect(projectMonthlyRuns(components, noAreas, null, "2026-10-01", 3, "mes_seguinte")).toEqual([
      { from: "2026-10-01", to: "2026-10-01", cents: 0 },
      { from: "2026-11-01", to: null, cents: 100_000 },
    ]);
  });
});
