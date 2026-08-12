import { describe, expect, it } from "vitest";

import { calculateAnnualReference } from "./annual-reference";
import type { ContractVersionSnapshot } from "./entities";
import { centsToDecimal, decimalToCents } from "./money";

const emptyVersion = (components: ContractVersionSnapshot["components"]): ContractVersionSnapshot => ({
  id: "version-1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  components,
  areaAllocations: [],
  partnerShares: [],
  commissions: [],
});

describe("money", () => {
  it.each([
    ["R$ 14.600,00", 1_460_000n],
    ["14600.00", 1_460_000n],
    [10.5, 1_050n],
    ["-150,25", -15_025n],
  ])("parses %s into exact integer cents", (value, expected) => {
    expect(decimalToCents(value)).toBe(expected);
  });

  it("formats negative cents as a decimal string", () => {
    expect(centsToDecimal(decimalToCents("-150,25"))).toBe("-150.25");
  });

  it.each(["1.001", "1,999", 0.001])("rejects more than two monetary decimals: %s", (value) => {
    expect(() => decimalToCents(value)).toThrow(/two decimal places/i);
  });
});

describe("calculateAnnualReference", () => {
  it("projects R$ 14.600 recurring over 12 competencies as R$ 175.200", () => {
    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version: emptyVersion([
        {
          id: "monthly",
          kind: "mensal_fixo",
          description: "Mensalidade",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          amountCents: decimalToCents("14600"),
        },
      ]),
      manualResolutions: [],
    });

    expect(result.calculatedCents).toBe(17_520_000n);
    expect(result.referenceCents).toBe(17_520_000n);
    expect(result.competencies).toHaveLength(12);
  });

  it("selects only effective components and counts each spot installment once", () => {
    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version: emptyVersion([
        {
          id: "step-a",
          kind: "mensal_escalonado",
          description: "Primeira faixa",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-03-01",
          amountCents: decimalToCents("100"),
        },
        {
          id: "step-b",
          kind: "mensal_escalonado",
          description: "Segunda faixa",
          effectiveFrom: "2026-04-01",
          effectiveTo: null,
          amountCents: decimalToCents("200"),
        },
        {
          id: "spot",
          kind: "spot",
          description: "Projeto",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          installments: [
            { number: 1, competency: "2026-02-01", amountCents: decimalToCents("300") },
            { number: 2, competency: "2026-07-01", amountCents: decimalToCents("400") },
          ],
          requiresManualRelease: false,
        },
      ]),
      manualResolutions: [],
    });

    expect(result.calculatedCents).toBe(280_000n);
  });

  it("excludes unreleased success and reimbursement values", () => {
    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version: emptyVersion([
        {
          id: "success",
          kind: "exito_valor_fixo",
          description: "Êxito",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          amountCents: decimalToCents("5000"),
          requiresManualRelease: true,
        },
        {
          id: "reimbursement",
          kind: "reembolso",
          description: "Custas",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          requiresManualRelease: true,
        },
      ]),
      manualResolutions: [],
    });

    expect(result.calculatedCents).toBe(0n);
  });

  it("rejects an annual override without a reason", () => {
    expect(() =>
      calculateAnnualReference({
        projectionStart: "2026-01-01",
        version: emptyVersion([]),
        manualResolutions: [],
        override: { amountCents: decimalToCents("1000"), reason: "  " },
      }),
    ).toThrow(/override reason/i);
  });
});
