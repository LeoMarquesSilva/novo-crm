import { describe, expect, it } from "vitest";

import type { BillingComponent } from "@/modules/contracts/domain/entities";
import { moneyCents } from "@/modules/contracts/domain/money";

import { buildClosedPriceInstallments, startMaintenanceAfterInstallments } from "./map-to-configuration";

describe("buildClosedPriceInstallments", () => {
  it("vence no mesmo dia de cada mês e ajusta o fim do mês", () => {
    const installments = buildClosedPriceInstallments({ count: 3, installmentAmountCents: 100, firstDueDate: "2027-01-31" });
    expect(installments.map((i) => [i.competency, i.dueDate])).toEqual([
      ["2027-01-01", "2027-01-31"],
      ["2027-02-01", "2027-02-28"],
      ["2027-03-01", "2027-03-31"],
    ]);
  });

  it("sem valor da parcela, divide o total e põe a sobra na última", () => {
    const installments = buildClosedPriceInstallments({ count: 3, totalCents: 1_000_000, firstDueDate: "2026-10-20" });
    expect(installments.map((i) => i.amountCents)).toEqual([BigInt(333_333), BigInt(333_333), BigInt(333_334)]);
  });

  it("usa valores e vencimentos conhecidos da proposta a partir da 2ª parcela", () => {
    const installments = buildClosedPriceInstallments({
      count: 2,
      firstDueDate: "2026-10-18",
      explicit: [
        { amountCents: 700_000, dueDate: null },
        { amountCents: 500_000, dueDate: "2026-12-05" },
      ],
    });
    expect(installments).toEqual([
      { number: 1, competency: "2026-10-01", dueDate: "2026-10-18", amountCents: BigInt(700_000) },
      { number: 2, competency: "2026-12-01", dueDate: "2026-12-05", amountCents: BigInt(500_000) },
    ]);
  });
});

describe("startMaintenanceAfterInstallments", () => {
  const base = { description: "x", effectiveTo: null, areaAllocationEligible: true };
  const maintenance: BillingComponent = {
    ...base,
    id: "m",
    kind: "manutencao",
    effectiveFrom: "2026-10-18",
    amountCents: moneyCents(BigInt(25_000)),
  };

  it("manutenção começa na competência seguinte à última parcela", () => {
    const closed: BillingComponent = {
      ...base,
      id: "p",
      kind: "mensal_preco_fechado",
      effectiveFrom: "2026-10-18",
      installments: buildClosedPriceInstallments({ count: 5, installmentAmountCents: 240_000, firstDueDate: "2026-10-20" }),
    };
    const [, shifted] = startMaintenanceAfterInstallments([closed, maintenance]);
    expect(shifted?.effectiveFrom).toBe("2027-03-01");
  });

  it("sem preço fechado, a manutenção fica onde está", () => {
    expect(startMaintenanceAfterInstallments([maintenance])[0]?.effectiveFrom).toBe("2026-10-18");
  });
});
