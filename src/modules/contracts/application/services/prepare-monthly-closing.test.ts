import { describe, expect, it } from "vitest";

import type { ContractVersionSnapshot } from "../../domain/entities";
import { moneyCents } from "../../domain/money";
import {
  ClosingPreparationError,
  prepareMonthlyClosing,
  type ClosingPreparationRepository,
  type PreparedRevisionWrite,
} from "./prepare-monthly-closing";

const activeVersion: ContractVersionSnapshot = {
  id: "version-2",
  effectiveFrom: "2026-06-01",
  effectiveTo: null,
  components: [{
    id: "fixed",
    kind: "mensal_fixo",
    description: "Mensalidade",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    amountCents: moneyCents(BigInt(1460000)),
  }, {
    id: "hours",
    kind: "variavel_hora",
    description: "Horas trabalhistas",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    chargeMode: "excedente",
    includedQuantity: 12,
    unitAmountCents: moneyCents(BigInt(30000)),
  }],
  areaAllocations: [],
  partnerShares: [],
  commissions: [],
};

function repository(overrides: Partial<ClosingPreparationRepository> = {}) {
  const writes: PreparedRevisionWrite[] = [];
  const repo: ClosingPreparationRepository = {
    findContract: async () => ({ lifecycle: "ativo" }),
    findApplicableVersion: async () => activeVersion,
    findClosing: async () => null,
    listConsumptions: async () => [{ id: "consumption", componentId: "hours", kind: "hora", quantity: 14 }],
    listManualResolutions: async () => [],
    createCalculatedRevision: async (write) => {
      writes.push(write);
      return { closingId: "closing-1", revisionId: "revision-1", revision: write.nextRevision };
    },
    ...overrides,
  };
  return { repo, writes };
}

describe("prepareMonthlyClosing", () => {
  it("seleciona a versao ativa pela competencia", async () => {
    let requestedCompetency = "";
    const { repo, writes } = repository({
      findApplicableVersion: async (_contractId, competency) => {
        requestedCompetency = competency;
        return activeVersion;
      },
    });

    await prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 0 });

    expect(requestedCompetency).toBe("2026-08-01");
    expect(writes[0].versionId).toBe("version-2");
  });

  it("reutiliza o fechamento unico do contrato e competencia", async () => {
    const { repo, writes } = repository({
      findClosing: async () => ({ id: "existing-closing", currentRevisionId: "rev-1", currentRevision: 1, currentStatus: "em_revisao" }),
    });

    await prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 1 });

    expect(writes[0].closingId).toBe("existing-closing");
    expect(writes[0].nextRevision).toBe(2);
  });

  it("persiste bloqueio quando falta consumo variavel", async () => {
    const { repo, writes } = repository({ listConsumptions: async () => [] });

    await prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 0 });

    expect(writes[0].items).toContainEqual(expect.objectContaining({ kind: "blocker", blockerCode: "missing_consumption", componentId: "hours", blocking: true }));
  });

  it("persiste exatamente os itens e totais produzidos pelo calculador", async () => {
    const { repo, writes } = repository();

    await prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 0 });

    expect(writes[0]).toMatchObject({
      totals: { honorariosCents: BigInt(1520000), tributosCents: BigInt(0), reembolsosCents: BigInt(0), totalCents: BigInt(1520000) },
      items: [
        expect.objectContaining({ kind: "memory", componentId: "fixed", amountCents: BigInt(1460000) }),
        expect.objectContaining({ kind: "memory", componentId: "hours", quantity: 2, unitAmountCents: BigInt(30000), amountCents: BigInt(60000) }),
      ],
    });
  });

  it("cria a revisao seguinte ao recalcular", async () => {
    const { repo, writes } = repository({
      findClosing: async () => ({ id: "closing-1", currentRevisionId: "revision-3", currentRevision: 3, currentStatus: "em_revisao" }),
    });

    const result = await prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 3 });

    expect(result.revision).toBe(4);
    expect(writes[0]).toMatchObject({ previousRevisionId: "revision-3", nextRevision: 4, expectedRevision: 3 });
  });

  it("rejeita contrato suspenso", async () => {
    const { repo } = repository({ findContract: async () => ({ lifecycle: "suspenso" }) });

    await expect(prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 0 }))
      .rejects.toMatchObject({ code: "CONTRACT_NOT_ACTIVE" });
  });

  it("nunca regrava a revisao aprovada", async () => {
    const { repo, writes } = repository({
      findClosing: async () => ({ id: "closing-1", currentRevisionId: "revision-1", currentRevision: 1, currentStatus: "aprovado" }),
    });

    await expect(prepareMonthlyClosing(repo, { contractId: "contract-1", competency: "2026-08-01", actorId: "actor-1", expectedRevision: 1 }))
      .rejects.toBeInstanceOf(ClosingPreparationError);
    expect(writes).toHaveLength(0);
  });
});
