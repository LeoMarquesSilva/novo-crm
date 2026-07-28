import type { OpportunityStage } from "@/modules/crm/domain/entities";

type AtomicTransitionUpdate = {
  updated_at: string;
  link_proposta?: string | null;
  link_contrato?: string | null;
  due_compilacao_entrada_em?: string | null;
  due_revision_cycle?: number | null;
  due_revisao_entrada_em?: string | null;
};

type AtomicTransitionFieldValue = {
  id: string | null;
  fieldDefinitionId: string;
  value: string | string[];
};

type AtomicTransitionInput = {
  opportunityId: string;
  expectedStage: OpportunityStage;
  nextStage: OpportunityStage;
  changedBy: string;
  update: AtomicTransitionUpdate;
  leadIntake: {
    local_reuniao: string;
    data_reuniao: string;
    horario_reuniao: string;
  } | null;
  fieldValues: AtomicTransitionFieldValue[];
};

export function buildAtomicTransitionRpcArgs(input: AtomicTransitionInput) {
  return {
    p_opportunity_id: input.opportunityId,
    p_expected_stage: input.expectedStage,
    p_next_stage: input.nextStage,
    p_changed_by: input.changedBy,
    p_updated_at: input.update.updated_at,
    p_link_proposta: input.update.link_proposta ?? null,
    p_set_link_proposta: Object.hasOwn(input.update, "link_proposta"),
    p_link_contrato: input.update.link_contrato ?? null,
    p_set_link_contrato: Object.hasOwn(input.update, "link_contrato"),
    p_due_compilacao_entrada_em:
      input.update.due_compilacao_entrada_em ?? null,
    p_due_revision_cycle: input.update.due_revision_cycle ?? null,
    p_due_revisao_entrada_em: input.update.due_revisao_entrada_em ?? null,
    p_lead_intake: input.leadIntake,
    p_field_values: input.fieldValues.map((fieldValue) => ({
      id: fieldValue.id,
      field_definition_id: fieldValue.fieldDefinitionId,
      value_json: fieldValue.value,
    })),
  };
}
