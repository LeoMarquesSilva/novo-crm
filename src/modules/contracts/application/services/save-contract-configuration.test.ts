import { describe, expect, it } from "vitest";

import { moneyCents } from "../../domain/money";
import type { ContractConfigurationInput } from "../../domain/contract-validation";

const expectedUpdatedAt = "2026-08-12T15:00:00.000Z";

function validConfiguration(): ContractConfigurationInput {
  return {
    clientId: "11111111-1111-4111-8111-111111111111",
    startsAt: "2026-09-01",
    indefinite: false,
    dueDay: 10,
    renewalDate: "2027-09-01",
    renewalAlertDate: "2027-08-02",
    adjustmentIndex: "IPCA",
    firstInvoiceAt: "2026-09-10",
    firstInvoiceConditioned: false,
    substitutionEvidence: [{ field: "startsAt", source: "proposta", originalValue: "2026-08-01", overrideReason: "Ajuste aprovado" }],
    responsibles: [{ id: "22222222-2222-4222-8222-222222222222", role: "socio" }],
    areas: [{
      id: "33333333-3333-4333-8333-333333333333",
      areaKey: "Trabalhista",
      includedProcesses: 20,
      includedHours: null,
      processExcessRateCents: moneyCents(BigInt(15_000)),
      hourExcessRateCents: null,
    }],
    version: {
      id: "44444444-4444-4444-8444-444444444444",
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      components: [{
        id: "55555555-5555-4555-8555-555555555555",
        kind: "mensal_fixo",
        description: "Mensalidade",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        areaId: "33333333-3333-4333-8333-333333333333",
        amountCents: moneyCents(BigInt(100_000)),
      }],
      areaAllocations: [{
        id: "66666666-6666-4666-8666-666666666666",
        areaId: "33333333-3333-4333-8333-333333333333",
        mode: "percentual",
        percentageBasisPoints: 10_000,
      }],
      partnerShares: [{
        id: "77777777-7777-4777-8777-777777777777",
        beneficiaryId: "22222222-2222-4222-8222-222222222222",
        percentageBasisPoints: 10_000,
      }],
      commissions: [{
        id: "88888888-8888-4888-8888-888888888888",
        beneficiaryId: "22222222-2222-4222-8222-222222222222",
        mode: "percentual",
        percentageBasisPoints: 500,
      }],
    },
  };
}

async function subject(overrides?: {
  status?: "rascunho" | "ativa";
  updatedAt?: string;
  opportunityStage?: "inclusao_faturamento" | "boas_vindas" | null;
}) {
  const { saveContractConfiguration } = await import("./save-contract-configuration");
  const writes: unknown[] = [];
  const repository = {
    async findVersionContext() {
      return {
        status: overrides?.status ?? "rascunho",
        number: 1,
        updatedAt: overrides?.updatedAt ?? expectedUpdatedAt,
        opportunityId: "99999999-9999-4999-8999-999999999999",
        opportunityStage: overrides?.opportunityStage ?? "inclusao_faturamento",
      };
    },
    async saveConfigurationAtomic(input: unknown) {
      writes.push(input);
      return { updatedAt: "2026-08-12T15:05:00.000Z" };
    },
  };
  return { saveContractConfiguration, repository, writes };
}

describe("saveContractConfiguration", () => {
  it("denies a role without the configure capability", async () => {
    const { saveContractConfiguration, repository, writes } = await subject();

    await expect(saveContractConfiguration(repository, {
      role: "comercial",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration: validConfiguration(),
    })).rejects.toMatchObject({ code: "CONTRACT_FORBIDDEN" });
    expect(writes).toEqual([]);
  });

  it("rejects a configuration with domain errors", async () => {
    const { saveContractConfiguration, repository, writes } = await subject();
    const configuration = validConfiguration();
    configuration.clientId = null;

    await expect(saveContractConfiguration(repository, {
      role: "controladoria",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration,
    })).rejects.toMatchObject({
      code: "CONTRACT_CONFIGURATION_INVALID",
      issues: [expect.objectContaining({ code: "client_required" })],
    });
    expect(writes).toEqual([]);
  });

  it("rejects an optimistic concurrency conflict", async () => {
    const { saveContractConfiguration, repository, writes } = await subject({
      updatedAt: "2026-08-12T15:00:01.000Z",
    });

    await expect(saveContractConfiguration(repository, {
      role: "admin",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration: validConfiguration(),
    })).rejects.toMatchObject({ code: "CONTRACT_VERSION_CONFLICT" });
    expect(writes).toEqual([]);
  });

  it("rejects mutation of an active version", async () => {
    const { saveContractConfiguration, repository, writes } = await subject({ status: "ativa" });

    await expect(saveContractConfiguration(repository, {
      role: "admin",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration: validConfiguration(),
    })).rejects.toMatchObject({ code: "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE" });
    expect(writes).toEqual([]);
  });

  it("requires inclusion billing stage for the first linked version", async () => {
    const { saveContractConfiguration, repository, writes } = await subject({
      opportunityStage: "boas_vindas",
    });

    await expect(saveContractConfiguration(repository, {
      role: "admin",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration: validConfiguration(),
    })).rejects.toMatchObject({ code: "OPPORTUNITY_STAGE_CONFLICT" });
    expect(writes).toEqual([]);
  });

  it("passes every normalized collection to the atomic repository write", async () => {
    const { saveContractConfiguration, repository, writes } = await subject();
    const configuration = validConfiguration();

    const result = await saveContractConfiguration(repository, {
      role: "controladoria",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration,
    });

    expect(result).toEqual({ updatedAt: "2026-08-12T15:05:00.000Z" });
    expect(writes).toEqual([{
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      versionId: "44444444-4444-4444-8444-444444444444",
      expectedVersionUpdatedAt: expectedUpdatedAt,
      configuration,
    }]);
  });
});

describe("assertContractActivationOpportunityPolicy", () => {
  it("rejects the first linked activation when atomic opportunity advance is disabled", async () => {
    const { assertContractActivationOpportunityPolicy } = await import("./save-contract-configuration");

    expect(() => assertContractActivationOpportunityPolicy({
      opportunityId: "99999999-9999-4999-8999-999999999999",
      contractStatus: "rascunho",
      activeVersionId: null,
      advanceOpportunity: false,
      opportunityStage: "inclusao_faturamento",
    })).toThrow(expect.objectContaining({ code: "OPPORTUNITY_STAGE_CONFLICT" }));
  });

  it("allows a later linked version without moving the onboarding opportunity again", async () => {
    const { assertContractActivationOpportunityPolicy } = await import("./save-contract-configuration");

    expect(() => assertContractActivationOpportunityPolicy({
      opportunityId: "99999999-9999-4999-8999-999999999999",
      contractStatus: "ativo",
      activeVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      advanceOpportunity: false,
      opportunityStage: "boas_vindas",
    })).not.toThrow();
  });

  it("requires inclusion billing stage whenever a linked activation requests advance", async () => {
    const { assertContractActivationOpportunityPolicy } = await import("./save-contract-configuration");

    expect(() => assertContractActivationOpportunityPolicy({
      opportunityId: "99999999-9999-4999-8999-999999999999",
      contractStatus: "ativo",
      activeVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      advanceOpportunity: true,
      opportunityStage: "boas_vindas",
    })).toThrow(expect.objectContaining({ code: "OPPORTUNITY_STAGE_CONFLICT" }));
  });
});
