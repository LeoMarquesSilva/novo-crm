import type { Oportunidade, OpportunityStage } from "../domain/entities";

export type LeadPipelineSituation = "em_andamento" | "vendidas" | "perdidas";

/** Depois da assinatura o lead segue no pós-venda, mas a venda já está fechada. */
const SOLD_STAGES = new Set<OpportunityStage>([
  "contrato_assinado",
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
]);

export function getLeadPipelineSituation(o: Pick<Oportunidade, "encerramento" | "etapa">): LeadPipelineSituation {
  if (o.encerramento === "perdido") return "perdidas";
  if (o.encerramento === "ganho" || SOLD_STAGES.has(o.etapa)) return "vendidas";
  return "em_andamento";
}
