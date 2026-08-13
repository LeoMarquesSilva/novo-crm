import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import type { Database } from "@/lib/supabase/database.types";

import {
  validateContractConfiguration,
  type ContractConfigurationInput,
  type ContractValidationIssue,
} from "../../domain/contract-validation";

export type ContractConfigurationErrorCode =
  | "CONTRACT_FORBIDDEN"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_CONFIGURATION_INVALID"
  | "CONTRACT_VERSION_CONFLICT"
  | "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE"
  | "OPPORTUNITY_STAGE_CONFLICT"
  | "CONTRACT_LIFECYCLE_REASON_REQUIRED"
  | "CONTRACT_LIFECYCLE_TRANSITION_INVALID"
  | "CONTRACT_VERSION_PERIOD_INVALID";

export class ContractConfigurationError extends Error {
  constructor(
    public readonly code: ContractConfigurationErrorCode,
    message: string,
    public readonly issues?: ContractValidationIssue[],
  ) {
    super(message);
    this.name = "ContractConfigurationError";
  }
}

export type ContractVersionConfigurationContext = {
  status: Database["public"]["Enums"]["contract_version_status"];
  number: number;
  updatedAt: string;
  opportunityId: string | null;
  opportunityStage: Database["public"]["Enums"]["opportunity_stage"] | null;
};

export type ContractConfigurationWrite = {
  actorId: string;
  contractId: string;
  versionId: string;
  expectedVersionUpdatedAt: string;
  configuration: ContractConfigurationInput;
};

export interface ContractConfigurationRepository {
  findVersionContext(contractId: string, versionId: string): Promise<ContractVersionConfigurationContext | null>;
  saveConfigurationAtomic(input: ContractConfigurationWrite): Promise<{ updatedAt: string }>;
}

export type SaveContractConfigurationInput = {
  role: Database["public"]["Enums"]["user_role"];
  actorId: string;
  contractId: string;
  expectedVersionUpdatedAt: string;
  configuration: ContractConfigurationInput;
};

export type VersionAction =
  | { action: "clone_draft"; sourceVersionId: string; effectiveFrom: string; addendumId?: string }
  | { action: "suspend_contract"; reason: string }
  | { action: "resume_contract"; reason: string }
  | { action: "end_contract"; endedAt: string; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertContractLifecycleTransition(
  current: Database["public"]["Enums"]["contract_lifecycle_status"],
  action: Exclude<VersionAction["action"], "clone_draft">,
): void {
  const allowed = (
    (action === "suspend_contract" && current === "ativo")
    || (action === "resume_contract" && current === "suspenso")
    || (action === "end_contract" && (current === "ativo" || current === "suspenso"))
  );
  if (!allowed) {
    throw new ContractConfigurationError(
      "CONTRACT_LIFECYCLE_TRANSITION_INVALID",
      `A ação ${action} não é permitida para contrato ${current}.`,
    );
  }
}

export function validateContractVersionAction(action: VersionAction): VersionAction {
  if (action.action === "clone_draft") {
    if (!ISO_DATE.test(action.effectiveFrom)) {
      throw new ContractConfigurationError("CONTRACT_VERSION_PERIOD_INVALID", "Informe uma vigência inicial válida.");
    }
    return action;
  }

  const reason = action.reason.trim();
  if (!reason) {
    throw new ContractConfigurationError("CONTRACT_LIFECYCLE_REASON_REQUIRED", "Informe o motivo da alteração de ciclo de vida.");
  }
  if (action.action === "end_contract") {
    if (!ISO_DATE.test(action.endedAt)) {
      throw new ContractConfigurationError("CONTRACT_VERSION_PERIOD_INVALID", "Informe uma data de encerramento válida.");
    }
    return { ...action, reason };
  }
  return { ...action, reason };
}

export function assertContractActivationOpportunityPolicy(input: {
  opportunityId: string | null;
  contractStatus: Database["public"]["Enums"]["contract_lifecycle_status"];
  activeVersionId: string | null;
  advanceOpportunity: boolean;
  opportunityStage: Database["public"]["Enums"]["opportunity_stage"] | null;
}): void {
  if (input.opportunityId === null) return;

  const hasPriorActivation = input.contractStatus === "ativo" || input.activeVersionId !== null;
  if (
    (!hasPriorActivation && !input.advanceOpportunity) ||
    (input.advanceOpportunity && input.opportunityStage !== "inclusao_faturamento")
  ) {
    throw new ContractConfigurationError(
      "OPPORTUNITY_STAGE_CONFLICT",
      "A ativação não pode avançar a oportunidade no estado atual.",
    );
  }
}

export async function saveContractConfiguration(
  repository: ContractConfigurationRepository,
  input: SaveContractConfigurationInput,
): Promise<{ updatedAt: string }> {
  if (!canAccessContractCapability({ role: input.role, capability: "configure" })) {
    throw new ContractConfigurationError(
      "CONTRACT_FORBIDDEN",
      "Você não tem permissão para configurar contratos.",
    );
  }

  const issues = validateContractConfiguration(input.configuration).filter(
    (issue) => issue.severity === "error",
  );
  if (issues.length > 0) {
    throw new ContractConfigurationError(
      "CONTRACT_CONFIGURATION_INVALID",
      "A configuração contratual contém erros.",
      issues,
    );
  }

  const versionId = input.configuration.version.id;
  const context = await repository.findVersionContext(input.contractId, versionId);
  if (!context) {
    throw new ContractConfigurationError("CONTRACT_NOT_FOUND", "Contrato ou versão não encontrado.");
  }
  if (context.status !== "rascunho") {
    throw new ContractConfigurationError(
      "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE",
      "Somente versões em rascunho podem ser alteradas.",
    );
  }
  if (context.updatedAt !== input.expectedVersionUpdatedAt) {
    throw new ContractConfigurationError(
      "CONTRACT_VERSION_CONFLICT",
      "A versão foi alterada por outra operação.",
    );
  }
  if (
    context.number === 1 &&
    context.opportunityId !== null &&
    context.opportunityStage !== "inclusao_faturamento"
  ) {
    throw new ContractConfigurationError(
      "OPPORTUNITY_STAGE_CONFLICT",
      "A primeira versão vinculada só pode ser salva em inclusão de faturamento.",
    );
  }

  return repository.saveConfigurationAtomic({
    actorId: input.actorId,
    contractId: input.contractId,
    versionId,
    expectedVersionUpdatedAt: input.expectedVersionUpdatedAt,
    configuration: input.configuration,
  });
}
