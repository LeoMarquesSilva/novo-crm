import { OpportunityStage } from "@/modules/crm/domain/entities";

export interface TransitionPayload {
  linkProposta?: string;
  linkContrato?: string;
  cadastroConcluido?: boolean;
  financeiroConcluido?: boolean;
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
  nextStage: OpportunityStage;
  payload: TransitionPayload;
}): string[] {
  const { nextStage, payload } = params;
  const requirements = stageRequirements[nextStage] ?? [];
  const missingFields = requirements.filter(
    (field) => !payloadFieldPresent(payload, field),
  );

  return missingFields.map((field) => `Campo obrigatório ausente: ${field}`);
}
