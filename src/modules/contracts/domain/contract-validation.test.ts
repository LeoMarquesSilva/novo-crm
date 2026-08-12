import { describe, expect, it } from "vitest";

import { moneyCents } from "./money";
import {
  type ContractConfigurationInput,
  validateContractConfiguration,
} from "./contract-validation";

function validConfiguration(): ContractConfigurationInput {
  return {
    clientId: "client-1",
    startsAt: "2026-08-01",
    firstInvoiceAt: "2026-08-10",
    firstInvoiceConditioned: false,
    responsibles: [{ id: "responsible-1", role: "billing" }],
    areas: [{ id: "area-1", areaKey: "Cível" }],
    version: {
      id: "version-1",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      components: [
        {
          id: "monthly-1",
          kind: "mensal_fixo",
          description: "Mensalidade",
          effectiveFrom: "2026-08-01",
          effectiveTo: null,
          areaId: "area-1",
          amountCents: moneyCents(BigInt(10_000)),
        },
      ],
      areaAllocations: [
        {
          id: "allocation-1",
          componentId: "monthly-1",
          areaId: "area-1",
          mode: "percentual",
          percentageBasisPoints: 10_000,
        },
      ],
      partnerShares: [
        {
          id: "share-1",
          beneficiaryId: "gustavo",
          percentageBasisPoints: 6_000,
        },
        {
          id: "share-2",
          beneficiaryId: "ricardo",
          percentageBasisPoints: 4_000,
        },
      ],
      commissions: [],
    },
  };
}

describe("validateContractConfiguration", () => {
  it("reports each missing activation prerequisite with a stable code and path", () => {
    const input = validConfiguration();
    input.clientId = null;
    input.startsAt = null;
    input.firstInvoiceAt = null;
    input.responsibles = [];
    input.version.components = [];
    input.version.areaAllocations = [];

    expect(validateContractConfiguration(input)).toEqual([
      expect.objectContaining({ code: "client_required", path: "clientId", severity: "error" }),
      expect.objectContaining({ code: "start_date_required", path: "startsAt", severity: "error" }),
      expect.objectContaining({ code: "first_invoice_required", path: "firstInvoiceAt", severity: "error" }),
      expect.objectContaining({ code: "responsible_required", path: "responsibles", severity: "error" }),
      expect.objectContaining({ code: "billing_component_required", path: "version.components", severity: "error" }),
    ]);
  });

  it("accepts a missing first invoice only when it is explicitly conditioned", () => {
    const input = validConfiguration();
    input.firstInvoiceAt = null;
    input.firstInvoiceConditioned = true;

    expect(validateContractConfiguration(input).map((issue) => issue.code)).not.toContain(
      "first_invoice_required",
    );
  });

  it("rejects overlapping stepped ranges in the same area", () => {
    const input = validConfiguration();
    input.version.components = [
      {
        id: "step-1",
        kind: "mensal_escalonado",
        description: "Faixa 1",
        effectiveFrom: "2026-08-01",
        effectiveTo: "2026-10-31",
        areaId: "area-1",
        amountCents: moneyCents(BigInt(10_000)),
      },
      {
        id: "step-2",
        kind: "mensal_escalonado",
        description: "Faixa 2",
        effectiveFrom: "2026-10-01",
        effectiveTo: null,
        areaId: "area-1",
        amountCents: moneyCents(BigInt(20_000)),
      },
    ];
    input.version.areaAllocations = [];

    expect(validateContractConfiguration(input)).toContainEqual(
      expect.objectContaining({ code: "stepped_ranges_overlap", path: "version.components[1]" }),
    );
  });

  it("rejects component and area references that are outside the configuration", () => {
    const input = validConfiguration();
    input.version.components[0]!.areaId = "missing-area";
    input.version.areaAllocations = [
      {
        id: "broken-allocation",
        componentId: "missing-component",
        areaId: "missing-area",
        mode: "percentual",
        percentageBasisPoints: 10_000,
      },
    ];

    expect(validateContractConfiguration(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "component_area_not_found", path: "version.components[0].areaId" }),
        expect.objectContaining({ code: "allocation_component_not_found", path: "version.areaAllocations[0].componentId" }),
        expect.objectContaining({ code: "allocation_area_not_found", path: "version.areaAllocations[0].areaId" }),
      ]),
    );
  });

  it("rejects percentage allocation and partner-share groups that do not close at 100%", () => {
    const input = validConfiguration();
    input.version.areaAllocations[0] = {
      id: "allocation-1",
      componentId: "monthly-1",
      areaId: "area-1",
      mode: "percentual",
      percentageBasisPoints: 9_000,
    };
    input.version.partnerShares[1]!.percentageBasisPoints = 3_000;

    expect(validateContractConfiguration(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "area_percentage_total_invalid", path: "version.areaAllocations" }),
        expect.objectContaining({ code: "partner_share_total_invalid", path: "version.partnerShares" }),
      ]),
    );
  });

  it("rejects fixed-value allocation that does not reconcile with its component", () => {
    const input = validConfiguration();
    input.version.areaAllocations = [
      {
        id: "allocation-1",
        componentId: "monthly-1",
        areaId: "area-1",
        mode: "valor",
        amountCents: moneyCents(BigInt(9_999)),
      },
    ];

    expect(validateContractConfiguration(input)).toContainEqual(
      expect.objectContaining({ code: "area_fixed_total_mismatch", path: "version.areaAllocations" }),
    );
  });

  it("rejects a component whose active period escapes the version period", () => {
    const input = validConfiguration();
    input.version.effectiveTo = "2026-12-31";
    input.version.components[0]!.effectiveTo = null;

    expect(validateContractConfiguration(input)).toContainEqual(
      expect.objectContaining({ code: "component_outside_version", path: "version.components[0]" }),
    );
  });

  it("warns when an included limit has no excess rate", () => {
    const input = validConfiguration();
    input.areas = [
      {
        id: "area-1",
        areaKey: "Trabalhista",
        includedProcesses: 20,
        processExcessRateCents: null,
        includedHours: 12,
        hourExcessRateCents: null,
      },
    ];

    expect(validateContractConfiguration(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_process_excess_rate", severity: "warning" }),
        expect.objectContaining({ code: "missing_hour_excess_rate", severity: "warning" }),
      ]),
    );
  });
});
