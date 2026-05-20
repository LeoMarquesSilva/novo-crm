import { OpportunityStage } from "@/modules/crm/domain/entities";
import { canMoveToStage } from "@/modules/crm/domain/workflow";
import {
  TransitionPayload,
  validateStagePreconditions,
} from "@/modules/crm/domain/workflow-rules";

export interface TransitionRequest {
  opportunityId: string;
  currentStage: OpportunityStage;
  nextStage: OpportunityStage;
  hasDueDiligence: boolean;
  changedBy: string;
  payload: TransitionPayload;
}

export interface TransitionAuditRecord {
  opportunityId: string;
  from: OpportunityStage;
  to: OpportunityStage;
  changedBy: string;
  changedAt: string;
}

export interface TransitionResult {
  ok: boolean;
  errors: string[];
  audit?: TransitionAuditRecord;
}

export function transitionOpportunity(
  request: TransitionRequest,
): TransitionResult {
  const canMove = canMoveToStage({
    currentStage: request.currentStage,
    nextStage: request.nextStage,
    hasDueDiligence: request.hasDueDiligence,
  });

  if (!canMove) {
    return {
      ok: false,
      errors: [
        "Transição inválida: só é permitido avançar ou voltar uma etapa no funil, sem pular.",
      ],
    };
  }

  const preconditionErrors = validateStagePreconditions({
    nextStage: request.nextStage,
    payload: request.payload,
  });

  if (preconditionErrors.length > 0) {
    return { ok: false, errors: preconditionErrors };
  }

  return {
    ok: true,
    errors: [],
    audit: {
      opportunityId: request.opportunityId,
      from: request.currentStage,
      to: request.nextStage,
      changedBy: request.changedBy,
      changedAt: new Date().toISOString(),
    },
  };
}
