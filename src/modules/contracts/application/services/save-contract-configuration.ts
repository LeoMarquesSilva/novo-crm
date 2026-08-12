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
  | "OPPORTUNITY_STAGE_CONFLICT";

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
