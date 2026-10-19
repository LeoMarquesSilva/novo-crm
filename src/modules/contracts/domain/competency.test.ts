import { describe, expect, it } from "vitest";

import {
  isComponentEffectiveInCompetency,
  isMonthlyFeeStartingMidMonth,
  periodTouchesCompetency,
  selectComponentsInCompetency,
} from "./competency";

describe("periodTouchesCompetency", () => {
  it("conta o mês em que o período começa, mesmo no meio do mês", () => {
    const period = { effectiveFrom: "2026-10-18", effectiveTo: null };
    expect(periodTouchesCompetency(period, "2026-09-01")).toBe(false);
    expect(periodTouchesCompetency(period, "2026-10-01")).toBe(true);
    expect(periodTouchesCompetency(period, "2026-11-01")).toBe(true);
  });

  it("conta o mês em que o período termina e para depois dele", () => {
    const period = { effectiveFrom: "2026-01-01", effectiveTo: "2027-01-17" };
    expect(periodTouchesCompetency(period, "2027-01-01")).toBe(true);
    expect(periodTouchesCompetency(period, "2027-02-01")).toBe(false);
  });

  it("sem datas, vale em qualquer competência", () => {
    expect(periodTouchesCompetency({}, "2026-10-01")).toBe(true);
  });
});

describe("isComponentEffectiveInCompetency", () => {
  const from = { effectiveFrom: "2026-10-18", effectiveTo: null };

  it.each(["mensal_preco_fechado", "spot", "acordo", "variavel_hora", "exito_percentual", "reembolso"])(
    "%s entra na competência do início da vigência",
    (kind) => {
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-10-01")).toBe(true);
    },
  );

  it.each(["mensal_fixo", "manutencao", "mensal_escalonado", "ajuste"])(
    "%s começa na competência seguinte sem a escolha do Financeiro (regra anterior)",
    (kind) => {
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-10-01")).toBe(false);
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-10-01", "mes_seguinte")).toBe(false);
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-11-01")).toBe(true);
    },
  );

  it.each(["mensal_fixo", "manutencao", "mensal_escalonado", "ajuste"])(
    "%s cobra o mês de início cheio quando o Financeiro escolhe mes_cheio",
    (kind) => {
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-09-01", "mes_cheio")).toBe(false);
      expect(isComponentEffectiveInCompetency({ kind, ...from }, "2026-10-01", "mes_cheio")).toBe(true);
    },
  );

  it("parcela entra no mês de início com qualquer escolha", () => {
    expect(isComponentEffectiveInCompetency({ kind: "mensal_preco_fechado", ...from }, "2026-10-01", "mes_seguinte")).toBe(true);
  });

  it("mensalidade que começa no dia 1 entra no próprio mês", () => {
    expect(isComponentEffectiveInCompetency({ kind: "manutencao", effectiveFrom: "2027-03-01" }, "2027-03-01")).toBe(true);
  });

  it.each([
    ["mes_seguinte", [0, 1, 1, 1, 1], ["", "first", "first", "first", "second"]],
    ["mes_cheio", [1, 1, 1, 1, 1], ["first", "first", "first", "second", "second"]],
  ] as const)("faixas trocadas no meio do mês cobram cada mês uma vez (%s)", (choice, counts, owners) => {
    const first = { id: "first", kind: "mensal_escalonado", effectiveFrom: "2026-10-18", effectiveTo: "2027-01-17" };
    const second = { id: "second", kind: "mensal_escalonado", effectiveFrom: "2027-01-18", effectiveTo: null };
    const months = ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"];
    const charged = months.map((month) => [first, second].filter((tier) => isComponentEffectiveInCompetency(tier, month, choice)));
    expect(charged.map((tiers) => tiers.length)).toEqual(counts);
    expect(charged.map((tiers) => tiers[0]?.id ?? "")).toEqual(owners);
  });
});

describe("selectComponentsInCompetency", () => {
  const monthly = { id: "fixed", kind: "mensal_fixo", effectiveFrom: "2026-10-18", effectiveTo: null };
  const months = (from: string, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1 + index, 1));
      return date.toISOString().slice(0, 10);
    });

  it.each([
    ["mes_cheio", "2026-10-01", "2027-09-01"],
    ["mes_seguinte", "2026-11-01", "2027-10-01"],
  ] as const)("12 meses de vigência dão 12 mensalidades (%s)", (choice, first, last) => {
    const version = { effectiveTo: "2027-10-17", startMonthBilling: choice, components: [monthly] };
    const charged = months("2026-09-01", 15).filter((month) => selectComponentsInCompetency(version, month).length > 0);
    expect(charged).toHaveLength(12);
    expect([charged[0], charged.at(-1)]).toEqual([first, last]);
  });
});

describe("isMonthlyFeeStartingMidMonth", () => {
  it("só pergunta para valor fixo por mês que começa depois do dia 1", () => {
    expect(isMonthlyFeeStartingMidMonth({ kind: "mensal_fixo", effectiveFrom: "2026-10-18" })).toBe(true);
    expect(isMonthlyFeeStartingMidMonth({ kind: "mensal_fixo", effectiveFrom: "2026-10-01" })).toBe(false);
    expect(isMonthlyFeeStartingMidMonth({ kind: "mensal_preco_fechado", effectiveFrom: "2026-10-18" })).toBe(false);
  });
});
