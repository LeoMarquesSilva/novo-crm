import { OpportunityStage } from "./entities";

const dueStages: OpportunityStage[] = [
  "levantamento_dados",
  "compilacao",
  "revisao",
  "due_diligence_finalizada",
];

const commonStages: OpportunityStage[] = [
  "reuniao",
  "confeccao_proposta",
  "proposta_enviada",
  "confeccao_contrato",
  "contrato_elaborado",
  "contrato_enviado",
  "contrato_assinado",
];

const postSaleStages: OpportunityStage[] = [
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
];

export function getAllowedJourney(hasDueDiligence: boolean): OpportunityStage[] {
  if (hasDueDiligence) {
    return ["cadastro_lead", ...dueStages, ...commonStages, ...postSaleStages];
  }

  return ["cadastro_lead", ...commonStages, ...postSaleStages];
}

/**
 * Permite avançar **ou voltar** exatamente uma etapa na jornada permitida (sem pular).
 */
export function canMoveToStage(params: {
  currentStage: OpportunityStage;
  nextStage: OpportunityStage;
  hasDueDiligence: boolean;
}): boolean {
  const { currentStage, nextStage, hasDueDiligence } = params;
  const journey = getAllowedJourney(hasDueDiligence);
  const currentIndex = journey.indexOf(currentStage);
  const nextIndex = journey.indexOf(nextStage);

  if (currentIndex === -1 || nextIndex === -1) return false;
  return Math.abs(nextIndex - currentIndex) === 1;
}
