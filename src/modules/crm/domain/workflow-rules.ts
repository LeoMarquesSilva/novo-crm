import { OpportunityStage } from "@/modules/crm/domain/entities";

export interface TransitionPayload {
  linkProposta?: string;
  linkContrato?: string;
  cadastroConcluido?: boolean;
  financeiroConcluido?: boolean;
}

export type ContractBillingTransitionState = {
  contractId: string | null;
  isValid: boolean;
  code: string | null;
  reason: string | null;
};

export type ContractTransitionBlocker = {
  code: "contract_billing_setup_required";
  message: string;
  contractId: string | null;
  actionHref: string;
};

export const CONTRACT_BILLING_BLOCKER_MESSAGE =
  "Conclua a configuração de faturamento e ative o contrato antes de avançar para Boas-vindas.";

export function buildContractTransitionBlocker(
  state: ContractBillingTransitionState,
  opportunityId: string,
): ContractTransitionBlocker | null {
  if (state.isValid) return null;
  return {
    code: "contract_billing_setup_required",
    message: CONTRACT_BILLING_BLOCKER_MESSAGE,
    contractId: state.contractId,
    actionHref: state.contractId
      ? `/crm/contratos/${state.contractId}?setup=1&returnTo=/crm/leads/${opportunityId}`
      : `/crm/contratos?setupOpportunityId=${opportunityId}`,
  };
}

const stageRequirements: Partial<Record<OpportunityStage, (keyof TransitionPayload)[]>> = {
  proposta_enviada: ["linkProposta"],
  contrato_elaborado: ["linkContrato"],
  contrato_assinado: ["linkContrato"],
};

function payloadFieldPresent(
  payload: TransitionPayload,
  field: keyof TransitionPayload,
): boolean {
  const v = payload[field];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v;
  return false;
}

/** Campos extras obrigatórios ao entrar nesta etapa (ex.: link da proposta). */
export function getPayloadFieldsRequiredForStage(
  nextStage: OpportunityStage,
): (keyof TransitionPayload)[] {
  return stageRequirements[nextStage] ?? [];
}

export function validateStagePreconditions(params: {
  currentStage: OpportunityStage;
  nextStage: OpportunityStage;
  payload: TransitionPayload;
}): string[] {
  const { currentStage, nextStage, payload } = params;
  const requirements = [
    ...(stageRequirements[nextStage] ?? []),
    ...(currentStage === "inclusao_faturamento" && nextStage === "boas_vindas"
      ? (["financeiroConcluido"] as const)
      : []),
  ];
  const missingFields = requirements.filter(
    (field) => !payloadFieldPresent(payload, field),
  );

  return missingFields.map((field) => `Campo obrigatório ausente: ${field}`);
}
