import type { OpportunityStage } from "@/modules/crm/domain/entities";

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  cadastro_lead: "Cadastro do Lead",
  levantamento_dados: "Levantamento de Dados",
  compilacao: "Compilação",
  revisao: "Revisão",
  due_diligence_finalizada: "Due Diligence Finalizada",
  reuniao: "Reunião",
  confeccao_proposta: "Elaboração da Proposta",
  proposta_enviada: "Proposta Enviada",
  confeccao_contrato: "Elaboração do Contrato",
  contrato_elaborado: "Contrato Elaborado",
  contrato_enviado: "Contrato Enviado",
  contrato_assinado: "Contrato Assinado",
  aguardando_cadastro: "Aguardando Cadastro",
  cadastro_novo_cliente: "Cadastro de Novo Cliente",
  inclusao_faturamento: "Inclusão no Fluxo de Faturamento",
  boas_vindas: "Boas-vindas",
  reuniao_kickoff: "Reunião Kick-off",
};
