import type { OpportunityStage } from "@/modules/crm/domain/entities";

const PROPOSAL_DOCUMENT_STAGES = new Set<OpportunityStage>([
  "confeccao_proposta",
  "proposta_enviada",
  "confeccao_contrato",
  "contrato_elaborado",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
]);

/** A proposta continua consultável depois que o lead deixa sua etapa de elaboração. */
export function isProposalDocumentAvailable(stage: OpportunityStage): boolean {
  return PROPOSAL_DOCUMENT_STAGES.has(stage);
}
