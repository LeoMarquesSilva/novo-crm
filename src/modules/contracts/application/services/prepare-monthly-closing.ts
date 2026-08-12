import { calculateMonthlyBilling } from "../../domain/billing-calculator";
import type {
  AllocationResult,
  BillingBlocker,
  BillingMemoryItem,
  ContractConsumption,
  ContractVersionSnapshot,
  ManualBillingResolution,
  TaxTreatment,
} from "../../domain/entities";
import type { MoneyCents } from "../../domain/money";
import { moneyCents } from "../../domain/money";

export function parseDatabaseMoneyCents(value: string | number | null): MoneyCents {
  const raw = String(value ?? "0").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error("INVALID_DATABASE_MONEY");
  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1);
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const rounded = BigInt(match[2]) * BigInt(100) + BigInt(fraction.slice(0, 2) || "0") + (Number(fraction[2] ?? "0") >= 5 ? BigInt(1) : BigInt(0));
  return moneyCents(sign * rounded);
}

export function parseDatabasePercentageBasisPoints(value: string | number | null): number {
  const basisPoints = parseDatabaseMoneyCents(value);
  const result = Number(basisPoints);
  if (!Number.isSafeInteger(result)) throw new Error("INVALID_DATABASE_PERCENTAGE");
  return result;
}

export function parsePersistedTaxTreatment(value: string | null): TaxTreatment | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { mode?: unknown; percentageBasisPoints?: unknown };
    if ((parsed.mode === "added" || parsed.mode === "included") && Number.isInteger(parsed.percentageBasisPoints) && Number(parsed.percentageBasisPoints) >= 0) {
      return { mode: parsed.mode, percentageBasisPoints: Number(parsed.percentageBasisPoints) };
    }
  } catch { return undefined; }
  return undefined;
}

export function safeBlockerResolution(value: string): "nao_cobrar" {
  if (value !== "nao_cobrar") throw new Error("BLOCKER_RESOLUTION_REQUIRES_WORKFLOW");
  return value;
}

export type ClosingRevisionStatus = "a_calcular" | "em_revisao" | "aprovado" | "lancado_vios" | "cancelado";
export type ClosingMutationAction = "approve" | "new_revision" | "register_vios" | "resolve_blocker";

export function expectedRevisionForPreparation(closing: { currentRevision: number } | null): number {
  return closing?.currentRevision ?? 0;
}

export function closingActionCapability(action: ClosingMutationAction) {
  if (action === "approve" || action === "new_revision") return "approve_closing" as const;
  if (action === "register_vios") return "register_vios" as const;
  return "prepare_closing" as const;
}

export type ExistingClosing = {
  id: string;
  currentRevisionId: string | null;
  currentRevision: number;
  currentStatus: ClosingRevisionStatus;
};

export type PreparedClosingItem =
  | ({ kind: "memory"; blocking: false } & BillingMemoryItem)
  | ({
      kind: "blocker";
      blocking: true;
      blockerCode: BillingBlocker["code"];
      componentId: string;
      description: string;
      amountCents: MoneyCents;
      excessQuantity?: number;
    })
  | ({ kind: "area_allocation" | "partner_share" | "commission"; blocking: false } & AllocationResult);

export type PreparedRevisionWrite = {
  actorId: string;
  contractId: string;
  versionId: string;
  competency: string;
  closingId: string | null;
  previousRevisionId: string | null;
  expectedRevision: number;
  nextRevision: number;
  totals: {
    honorariosCents: MoneyCents;
    tributosCents: MoneyCents;
    reembolsosCents: MoneyCents;
    totalCents: MoneyCents;
  };
  items: PreparedClosingItem[];
};

export interface ClosingPreparationRepository {
  findContract(contractId: string): Promise<{ lifecycle: string } | null>;
  findApplicableVersion(contractId: string, competency: string): Promise<ContractVersionSnapshot | null>;
  findClosing(contractId: string, competency: string): Promise<ExistingClosing | null>;
  listConsumptions(contractId: string, versionId: string, competency: string): Promise<ContractConsumption[]>;
  listManualResolutions(contractId: string, versionId: string, competency: string): Promise<ManualBillingResolution[]>;
  createCalculatedRevision(input: PreparedRevisionWrite): Promise<{ closingId: string; revisionId: string; revision: number }>;
}

export type ClosingPreparationErrorCode =
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_NOT_ACTIVE"
  | "CONTRACT_VERSION_NOT_FOUND"
  | "CLOSING_REVISION_CONFLICT"
  | "APPROVED_CLOSING_IMMUTABLE";

export class ClosingPreparationError extends Error {
  constructor(public readonly code: ClosingPreparationErrorCode, message: string) {
    super(message);
    this.name = "ClosingPreparationError";
  }
}

export async function prepareMonthlyClosing(
  repository: ClosingPreparationRepository,
  input: { contractId: string; competency: string; actorId: string; expectedRevision: number },
) {
  const contract = await repository.findContract(input.contractId);
  if (!contract) throw new ClosingPreparationError("CONTRACT_NOT_FOUND", "Contrato não encontrado.");
  if (contract.lifecycle !== "ativo") {
    throw new ClosingPreparationError("CONTRACT_NOT_ACTIVE", "Somente contratos ativos podem gerar fechamento.");
  }

  const version = await repository.findApplicableVersion(input.contractId, input.competency);
  if (!version) {
    throw new ClosingPreparationError("CONTRACT_VERSION_NOT_FOUND", "Nenhuma versão ativa cobre a competência.");
  }
  const closing = await repository.findClosing(input.contractId, input.competency);
  const currentRevision = closing?.currentRevision ?? 0;
  if (currentRevision !== input.expectedRevision) {
    throw new ClosingPreparationError("CLOSING_REVISION_CONFLICT", "O fechamento foi alterado por outra operação.");
  }
  if (closing?.currentStatus === "aprovado" || closing?.currentStatus === "lancado_vios") {
    throw new ClosingPreparationError("APPROVED_CLOSING_IMMUTABLE", "Crie uma correção para alterar um fechamento aprovado.");
  }

  const [consumptions, manualResolutions] = await Promise.all([
    repository.listConsumptions(input.contractId, version.id, input.competency),
    repository.listManualResolutions(input.contractId, version.id, input.competency),
  ]);
  const calculated = calculateMonthlyBilling({
    contractId: input.contractId,
    competency: input.competency,
    version,
    consumptions,
    manualResolutions,
  });
  const items: PreparedClosingItem[] = [
    ...calculated.items.map((item): PreparedClosingItem => ({ ...item, kind: "memory", blocking: false })),
    ...calculated.blockers.map((blocker): PreparedClosingItem => ({
      kind: "blocker",
      blocking: true,
      blockerCode: blocker.code,
      componentId: blocker.componentId,
      description: blocker.message,
      amountCents: BigInt(0) as MoneyCents,
      excessQuantity: blocker.excessQuantity,
    })),
    ...calculated.areaAllocations.map((item): PreparedClosingItem => ({ ...item, kind: "area_allocation", blocking: false })),
    ...calculated.partnerShares.map((item): PreparedClosingItem => ({ ...item, kind: "partner_share", blocking: false })),
    ...calculated.commissions.map((item): PreparedClosingItem => ({ ...item, kind: "commission", blocking: false })),
  ];

  return repository.createCalculatedRevision({
    actorId: input.actorId,
    contractId: input.contractId,
    versionId: version.id,
    competency: input.competency,
    closingId: closing?.id ?? null,
    previousRevisionId: closing?.currentRevisionId ?? null,
    expectedRevision: input.expectedRevision,
    nextRevision: currentRevision + 1,
    totals: {
      honorariosCents: calculated.honorariosCents,
      tributosCents: calculated.tributosCents,
      reembolsosCents: calculated.reembolsosCents,
      totalCents: calculated.totalCents,
    },
    items,
  });
}
