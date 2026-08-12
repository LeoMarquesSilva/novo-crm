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
    ["R$ 14.600,00", BigInt(1_460_000)],
    ["14600.00", BigInt(1_460_000)],
    [10.5, BigInt(1_050)],
    ["-150,25", -BigInt(15_025)],
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

    expect(result.calculatedCents).toBe(BigInt(17_520_000));
    expect(result.referenceCents).toBe(BigInt(17_520_000));
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

    expect(result.calculatedCents).toBe(BigInt(280_000));
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

    expect(result.calculatedCents).toBe(BigInt(0));
  });

  it("projects components only while the contract version is effective", () => {
    const version = emptyVersion([
      {
        id: "monthly",
        kind: "mensal_fixo",
        description: "Mensalidade",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        amountCents: decimalToCents("100"),
      },
    ]);
    version.effectiveTo = "2026-03-01";

    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version,
      manualResolutions: [],
    });

    expect(result.calculatedCents).toBe(BigInt(30_000));
    expect(result.competencies.map((entry) => entry.amountCents)).toEqual([
      BigInt(10_000), BigInt(10_000), BigInt(10_000),
      BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0),
      BigInt(0), BigInt(0), BigInt(0),
    ]);
  });

  it("prefers a competency-specific resolution over an earlier global resolution", () => {
    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version: emptyVersion([
        {
          id: "reimbursement",
          kind: "reembolso",
          description: "Reembolso",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          requiresManualRelease: true,
        },
      ]),
      manualResolutions: [
        { componentId: "reimbursement", released: true, amountCents: decimalToCents("100") },
        {
          componentId: "reimbursement",
          competency: "2026-01-01",
          released: true,
          amountCents: decimalToCents("250"),
        },
      ],
    });

    expect(result.calculatedCents).toBe(BigInt(135_000));
    expect(result.competencies[0].amountCents).toBe(BigInt(25_000));
  });

  it("does not fall back to a released global resolution when the competency-specific one is unreleased", () => {
    const result = calculateAnnualReference({
      projectionStart: "2026-01-01",
      version: emptyVersion([
        {
          id: "reimbursement",
          kind: "reembolso",
          description: "Reembolso",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          requiresManualRelease: true,
        },
      ]),
      manualResolutions: [
        { componentId: "reimbursement", released: true, amountCents: decimalToCents("100") },
        {
          componentId: "reimbursement",
          competency: "2026-01-01",
          released: false,
          amountCents: decimalToCents("250"),
        },
      ],
    });

    expect(result.competencies[0].amountCents).toBe(BigInt(0));
    expect(result.calculatedCents).toBe(BigInt(110_000));
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
