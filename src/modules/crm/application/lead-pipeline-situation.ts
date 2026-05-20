import type { Oportunidade } from "../domain/entities";

export type LeadPipelineSituation = "em_andamento" | "vendidas" | "perdidas";

export function getLeadPipelineSituation(o: Oportunidade): LeadPipelineSituation {
  if (o.encerramento === "perdido") return "perdidas";
  if (o.encerramento === "ganho" || o.etapa === "contrato_assinado") return "vendidas";
  return "em_andamento";
}
