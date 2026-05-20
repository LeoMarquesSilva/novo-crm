import type { OpportunityStage } from "@/modules/crm/domain/entities";

export interface PipelineBoardColumn {
  stage: OpportunityStage;
  title: string;
}

/** Etapas do funil de vendas (pós “Cadastro do lead” no RD), ordem do kanban. */
export const SALES_PIPELINE_COLUMNS: PipelineBoardColumn[] = [
  { stage: "levantamento_dados", title: "Levantamento de Dados" },
  { stage: "compilacao", title: "Compilação" },
  { stage: "revisao", title: "Revisão" },
  { stage: "due_diligence_finalizada", title: "Due Diligence Finalizada" },
  { stage: "reuniao", title: "Reunião" },
  { stage: "confeccao_proposta", title: "Elaboração da Proposta" },
  { stage: "proposta_enviada", title: "Proposta Enviada" },
  { stage: "confeccao_contrato", title: "Elaboração do Contrato" },
  { stage: "contrato_elaborado", title: "Contrato Elaborado" },
  { stage: "contrato_enviado", title: "Contrato Enviado" },
  { stage: "contrato_assinado", title: "Contrato Assinado" },
];

/** Funil de pós-venda (ordem operacional / RD), alinhado ao levantamento 3.2. */
export const POS_VENDA_PIPELINE_COLUMNS: PipelineBoardColumn[] = [
  { stage: "aguardando_cadastro", title: "Aguardando Cadastro" },
  { stage: "cadastro_novo_cliente", title: "Cadastro de Novo Cliente" },
  { stage: "inclusao_faturamento", title: "Inclusão no Fluxo de Faturamento" },
  { stage: "boas_vindas", title: "Boas-vindas" },
  { stage: "reuniao_kickoff", title: "Reunião Kick-off" },
];

const SALES_STAGES = new Set(SALES_PIPELINE_COLUMNS.map((c) => c.stage));
const POS_STAGES = new Set(POS_VENDA_PIPELINE_COLUMNS.map((c) => c.stage));

export function isSalesPipelineStage(etapa: OpportunityStage): boolean {
  return SALES_STAGES.has(etapa);
}

export function isPosVendaPipelineStage(etapa: OpportunityStage): boolean {
  return POS_STAGES.has(etapa);
}

/** Etapa inicial fora dos dois kanbans (ex.: novo cadastro ainda não avançou). */
export function isCadastroLeadOnlyStage(etapa: OpportunityStage): boolean {
  return etapa === "cadastro_lead";
}

/** Funil usado em `field_definitions` / validação de transição. */
export function pipelineCodeForStage(etapa: OpportunityStage): "vendas" | "pos_venda" {
  return isPosVendaPipelineStage(etapa) ? "pos_venda" : "vendas";
}
