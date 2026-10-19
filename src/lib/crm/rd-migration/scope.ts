import {
  isRdDisplayLabelInPipelineMap,
  opportunityStageFromDisplayLabel,
} from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

import type { RdDealSnapshot } from "./rd-deal";

/**
 * Etapas do RD que migram na virada (decisão de 19/10/2026): funil de vendas inteiro até
 * Contrato Assinado e pós-venda até Inclusão no Faturamento. Boas-vindas, Kick-off,
 * Execução do Serviço e os funis de contato ficam no RD.
 */
export const RD_MIGRATION_STAGES: readonly OpportunityStage[] = [
  "cadastro_lead",
  "levantamento_dados",
  "compilacao",
  "revisao",
  "due_diligence_finalizada",
  "reuniao",
  "confeccao_proposta",
  "proposta_enviada",
  "confeccao_contrato",
  "contrato_elaborado",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
];

/** Ordem do fluxo do CRM (vendas → pós-venda), para comparar etapas. */
export const CRM_STAGE_ORDER: readonly OpportunityStage[] = [
  "cadastro_lead",
  "levantamento_dados",
  "compilacao",
  "revisao",
  "due_diligence_finalizada",
  "reuniao",
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
];

export function stageIndex(stage: OpportunityStage): number {
  return CRM_STAGE_ORDER.indexOf(stage);
}

/** `stage` está entre `from` e `to` (inclusive) na ordem do fluxo. */
export function stageBetween(stage: OpportunityStage, from: OpportunityStage, to: OpportunityStage): boolean {
  const i = stageIndex(stage);
  return i >= stageIndex(from) && i <= stageIndex(to);
}

export const POST_SALE_MIGRATION_STAGES: readonly OpportunityStage[] = [
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
];

export function isPostSaleMigrationStage(stage: OpportunityStage): boolean {
  return POST_SALE_MIGRATION_STAGES.includes(stage);
}

export type RdMigrationScope =
  | { inScope: true; rdStage: OpportunityStage; targetStage: OpportunityStage }
  | { inScope: false; rdStage: OpportunityStage | null; reason: "sem_etapa" | "etapa_fora" | "perdido" };

/**
 * Onde o negócio do RD cai no CRM. Contrato Assinado vai direto para Aguardando Cadastro (no CRM
 * a assinatura já abre o pós-venda); Cadastro do Lead vai para Levantamento de Dados (com DUE)
 * ou Reunião, como um lead novo do CRM.
 */
export function rdMigrationTargetStage(rdStage: OpportunityStage, haveraDueDiligence: boolean): OpportunityStage {
  if (rdStage === "contrato_assinado") return "aguardando_cadastro";
  if (rdStage === "cadastro_lead") return haveraDueDiligence ? "levantamento_dados" : "reuniao";
  return rdStage;
}

/**
 * Negócio do RD entra na migração quando a etapa do RD é uma das etapas mapeadas em escopo e
 * o negócio não está perdido. Rótulo desconhecido (Execução do Serviço, Contato Inicial…) fica
 * fora mesmo que o import tenha gravado `cadastro_lead` por falta de mapa.
 */
export function resolveRdMigrationScope(input: {
  deal: RdDealSnapshot | null;
  /** `oportunidades.etapa` gravada pelo import (já ajustada). */
  dbStage: OpportunityStage;
  encerramento: string | null;
  haveraDueDiligence: boolean;
}): RdMigrationScope {
  const label = input.deal?.stageLabel?.trim() ?? "";
  if (!label) return { inScope: false, rdStage: null, reason: "sem_etapa" };
  if (!isRdDisplayLabelInPipelineMap(label)) return { inScope: false, rdStage: null, reason: "etapa_fora" };

  const fromLabel = opportunityStageFromDisplayLabel(label);
  // O import já resolve "Cadastro do Lead" para Levantamento/Reunião; prefere a etapa gravada.
  const rdStage = fromLabel === "cadastro_lead" && input.dbStage !== "cadastro_lead" ? input.dbStage : fromLabel;
  if (!RD_MIGRATION_STAGES.includes(rdStage)) return { inScope: false, rdStage, reason: "etapa_fora" };
  if (input.encerramento === "perdido" || input.deal?.win === false) {
    return { inScope: false, rdStage, reason: "perdido" };
  }
  return { inScope: true, rdStage, targetStage: rdMigrationTargetStage(rdStage, input.haveraDueDiligence) };
}
