import { describe, expect, it } from "vitest";

import { allocateCentsByPercentage, calculateMonthlyBilling } from "./billing-calculator";
import type {
  BillingComponent,
  BillingCalculationInput,
  ContractVersionSnapshot,
} from "./entities";
import { decimalToCents } from "./money";

const versionWith = (
  components: BillingComponent[],
  rest: Partial<ContractVersionSnapshot> = {},
): ContractVersionSnapshot => ({
  id: "version-1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  components,
  areaAllocations: [],
  partnerShares: [],
  commissions: [],
  ...rest,
});

const calculate = (
  components: BillingComponent[],
  rest: Partial<BillingCalculationInput> = {},
) =>
  calculateMonthlyBilling({
    contractId: "contract-1",
    competency: "2026-08-01",
    version: versionWith(components),
    consumptions: [],
    manualResolutions: [],
    ...rest,
  });

describe("calculateMonthlyBilling", () => {
  it("charges fixed, stepped and the competency's closed installment in deterministic order", () => {
    const result = calculate([
      {
        id: "fixed",
        kind: "mensal_fixo",
        description: "Fixo",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        amountCents: decimalToCents("1000"),
      },
      {
        id: "old-step",
        kind: "mensal_escalonado",
        description: "Faixa antiga",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-07-01",
        amountCents: decimalToCents("500"),
      },
      {
        id: "current-step",
        kind: "mensal_escalonado",
        description: "Faixa atual",
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
        amountCents: decimalToCents("800"),
      },
      {
        id: "closed",
        kind: "mensal_preco_fechado",
        description: "Preço fechado",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        installments: [
          { number: 1, competency: "2026-07-01", amountCents: decimalToCents("200") },
          { number: 2, competency: "2026-08-01", amountCents: decimalToCents("300") },
        ],
      },
    ]);

    expect(result.honorariosCents).toBe(BigInt(210_000));
    expect(result.items.filter((item) => item.category === "charge").map((item) => item.componentId)).toEqual([
      "fixed",
      "current-step",
      "closed",
    ]);
  });

  it.each([
    ["variavel_processo" as const, "processo" as const, "quantidade_total" as const, 7, 0, "50", BigInt(35_000)],
    ["variavel_hora" as const, "hora" as const, "excedente" as const, 7, 5, "50", BigInt(10_000)],
    ["despesa_km" as const, "quilometro" as const, "quantidade_total" as const, 40, 0, "2", BigInt(8_000)],
  ])("calculates %s consumption in %s mode", (kind, consumptionKind, mode, quantity, included, rate, expected) => {
    const result = calculate(
      [
        {
          id: "variable",
          kind,
          description: "Variável",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "labor",
          chargeMode: mode,
          includedQuantity: included,
          unitAmountCents: decimalToCents(rate),
        },
      ],
      {
        consumptions: [
          {
            id: "consumption",
            componentId: "variable",
            areaId: "labor",
            kind: consumptionKind,
            quantity,
          },
        ],
      },
    );

    expect(result.honorariosCents).toBe(expected);
  });

  it("includes manually released conditional, reimbursement and percentage success values", () => {
    const result = calculate(
      [
        {
          id: "conditional",
          kind: "mensal_condicionado",
          description: "Condicionado",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          amountCents: decimalToCents("500"),
          requiresManualRelease: true,
        },
        {
          id: "success",
          kind: "exito_percentual",
          description: "Êxito",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          percentageBasisPoints: 1_000,
          requiresManualRelease: true,
        },
        {
          id: "reimbursement",
          kind: "reembolso",
          description: "Reembolso",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          requiresManualRelease: true,
        },
      ],
      {
        manualResolutions: [
          { componentId: "conditional", released: true },
          { componentId: "success", released: true, baseCents: decimalToCents("2000") },
          { componentId: "reimbursement", released: true, amountCents: decimalToCents("125.50") },
        ],
      },
    );

    expect(result.honorariosCents).toBe(BigInt(70_000));
    expect(result.reembolsosCents).toBe(BigInt(12_550));
    expect(result.totalCents).toBe(BigInt(82_550));
  });

  it("applies discount and accrual before separating added tax", () => {
    const result = calculate([
      {
        id: "fixed",
        kind: "mensal_fixo",
        description: "Fixo",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        amountCents: decimalToCents("1000"),
        tax: { mode: "added", percentageBasisPoints: 1_000 },
      },
      {
        id: "discount",
        kind: "ajuste",
        description: "Desconto",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        amountCents: decimalToCents("-100"),
        reason: "Crédito comercial",
      },
      {
        id: "accrual",
        kind: "ajuste",
        description: "Acréscimo",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        amountCents: decimalToCents("50"),
        reason: "Serviço adicional",
      },
    ]);

    expect(result.honorariosCents).toBe(BigInt(95_000));
    expect(result.tributosCents).toBe(BigInt(10_000));
    expect(result.totalCents).toBe(BigInt(105_000));
  });

  it("reconciles percentage and value area allocations exactly", () => {
    const percentageResult = calculateMonthlyBilling({
      contractId: "contract-1",
      competency: "2026-08-01",
      version: versionWith(
        [
          {
            id: "fixed",
            kind: "mensal_fixo",
            description: "Fixo",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
            amountCents: decimalToCents("100.01"),
          },
        ],
        {
          areaAllocations: [
            { id: "a", areaId: "labor", mode: "percentual", percentageBasisPoints: 5_000 },
            { id: "b", areaId: "civil", mode: "percentual", percentageBasisPoints: 5_000 },
          ],
        },
      ),
      consumptions: [],
      manualResolutions: [],
    });
    const valueResult = calculateMonthlyBilling({
      contractId: "contract-1",
      competency: "2026-08-01",
      version: versionWith(
        [
          {
            id: "fixed",
            kind: "mensal_fixo",
            description: "Fixo",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
            amountCents: decimalToCents("100"),
          },
        ],
        {
          areaAllocations: [
            { id: "a", areaId: "labor", mode: "valor", amountCents: decimalToCents("60") },
            { id: "b", areaId: "civil", mode: "valor", amountCents: decimalToCents("40") },
          ],
        },
      ),
      consumptions: [],
      manualResolutions: [],
    });

    expect(percentageResult.areaAllocations.map((line) => line.amountCents)).toEqual([BigInt(5_000), BigInt(5_001)]);
    expect(valueResult.areaAllocations.map((line) => line.amountCents)).toEqual([BigInt(6_000), BigInt(4_000)]);
    expect(allocateCentsByPercentage(decimalToCents("0.01"), [3_333, 3_333, 3_334])).toEqual([
      BigInt(0),
      BigInt(0),
      BigInt(1),
    ]);
  });

  it("reports partner participation and commission as separate memory items without adding them to total", () => {
    const result = calculateMonthlyBilling({
      contractId: "contract-1",
      competency: "2026-08-01",
      version: versionWith(
        [
          {
            id: "fixed",
            kind: "mensal_fixo",
            description: "Fixo",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
            amountCents: decimalToCents("1000"),
          },
        ],
        {
          partnerShares: [
            { id: "p1", beneficiaryId: "gustavo", percentageBasisPoints: 6_000 },
            { id: "p2", beneficiaryId: "ricardo", percentageBasisPoints: 4_000 },
          ],
          commissions: [
            { id: "c1", beneficiaryId: "captor", mode: "percentual", percentageBasisPoints: 1_000 },
            { id: "c2", beneficiaryId: "indication", mode: "valor", amountCents: decimalToCents("25") },
          ],
        },
      ),
      consumptions: [],
      manualResolutions: [],
    });

    expect(result.partnerShares.map((line) => line.amountCents)).toEqual([BigInt(60_000), BigInt(40_000)]);
    expect(result.commissions.map((line) => line.amountCents)).toEqual([BigInt(10_000), BigInt(2_500)]);
    expect(result.items.map((item) => item.category)).toEqual([
      "charge",
      "partner_share",
      "partner_share",
      "commission",
      "commission",
    ]);
    expect(result.totalCents).toBe(BigInt(100_000));
  });

  it("preserves the Ingevity calculation and emits missing-rate blockers", () => {
    const result = calculate(
      [
        {
          id: "fixed",
          kind: "mensal_fixo",
          description: "Mensalidade fixa",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          amountCents: decimalToCents("14600"),
        },
        {
          id: "labor-process",
          kind: "variavel_processo",
          description: "Processos trabalhistas",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "labor",
          chargeMode: "excedente",
          includedQuantity: 20,
          unitAmountCents: null,
        },
        {
          id: "labor-hours",
          kind: "variavel_hora",
          description: "Horas trabalhistas",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "labor",
          chargeMode: "excedente",
          includedQuantity: 12,
          unitAmountCents: null,
        },
        {
          id: "civil-process",
          kind: "variavel_processo",
          description: "Processos cíveis",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "civil",
          chargeMode: "excedente",
          includedQuantity: 2,
          unitAmountCents: null,
        },
        {
          id: "contract-hours",
          kind: "variavel_hora",
          description: "Horas contratos",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "contracts",
          chargeMode: "excedente",
          includedQuantity: 6,
          unitAmountCents: null,
        },
        {
          id: "km",
          kind: "despesa_km",
          description: "Quilometragem",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          areaId: "labor",
          chargeMode: "quantidade_total",
          includedQuantity: 0,
          unitAmountCents: decimalToCents("2"),
        },
      ],
      {
        consumptions: [
          { id: "c1", componentId: "labor-process", areaId: "labor", kind: "processo", quantity: 18 },
          { id: "c2", componentId: "labor-hours", areaId: "labor", kind: "hora", quantity: 14 },
          { id: "c3", componentId: "civil-process", areaId: "civil", kind: "processo", quantity: 2 },
          { id: "c4", componentId: "contract-hours", areaId: "contracts", kind: "hora", quantity: 7 },
          { id: "c5", componentId: "km", areaId: "labor", kind: "quilometro", quantity: 40 },
        ],
      },
    );

    expect(result.totalCents).toBe(BigInt(1_468_000));
    expect(result.blockers.map((blocker) => [blocker.code, blocker.componentId, blocker.excessQuantity])).toEqual([
      ["missing_excess_rate", "labor-hours", 2],
      ["missing_excess_rate", "contract-hours", 1],
    ]);
  });
});
