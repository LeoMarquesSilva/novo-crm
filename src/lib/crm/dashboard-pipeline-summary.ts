import {
  POS_VENDA_PIPELINE_COLUMNS,
  SALES_PIPELINE_COLUMNS,
  type PipelineBoardColumn,
} from "@/lib/crm/pipeline-board-config";
import { getDwellTrafficStatus } from "@/lib/crm/stage-dwell-traffic";
import { stageIndex } from "@/lib/crm/rd-migration/scope";
import { getLeadPipelineSituation } from "@/modules/crm/application/lead-pipeline-situation";
import type { Oportunidade, OpportunityStage } from "@/modules/crm/domain/entities";

/**
 * Resumo do funil para o Dashboard comercial com as mesmas regras do kanban:
 * colunas e ordem de `pipeline-board-config`, situação de `getLeadPipelineSituation`
 * (perdido fica fora do funil) e "parado" = vermelho do semáforo de `stage-dwell-traffic`.
 */
export type DashboardLead = Pick<
  Oportunidade,
  "etapa" | "encerramento" | "origemRd" | "diasNaEtapa" | "rdMigracaoPendente" | "dueReviewAdjustments"
>;

export interface DashboardStageRow {
  stage: OpportunityStage;
  title: string;
  total: number;
  rd: number;
  /** Amarelo no quadro: esgotando o prazo da etapa. */
  atencao: number;
  /** Vermelho no quadro: além do prazo da etapa (só leads do CRM, que andam aqui). */
  parados: number;
  /** Leads do RD sem movimento além do prazo: só consulta no CRM, não pintam a barra de vermelho. */
  paradosRd: number;
}

export interface DashboardFunnel {
  key: "vendas" | "pos_venda";
  title: string;
  total: number;
  rd: number;
  parados: number;
  paradosRd: number;
  rows: DashboardStageRow[];
}

export interface DashboardPipelineSummary {
  vendas: DashboardFunnel;
  posVenda: DashboardFunnel;
  /** Vendas ainda em andamento (sem perdidos e sem contrato assinado). */
  emNegociacao: { total: number; crm: number; rd: number };
  perdidos: number;
  atencao: {
    /** Leads do CRM além do prazo da etapa. */
    parados: { total: number; pior: { title: string; dias: number } | null };
    /** Leads do RD sem movimento no RD além do prazo da etapa (o tempo deles é a última atualização no RD). */
    rdSemMovimento: number;
    /** Leads do CRM em "Contrato enviado", esperando as assinaturas no D4Sign. */
    aguardandoAssinatura: number;
    dueComAjustes: number;
    rdMigracaoPendente: number;
  };
}

/** Venda fechada esperando o pós-venda: o tempo nela não conta como lead parado. */
const STAGES_SEM_PRAZO = new Set<OpportunityStage>(["contrato_assinado"]);

function emptyFunnel(key: DashboardFunnel["key"], title: string, columns: PipelineBoardColumn[]) {
  const rows = columns.map<DashboardStageRow>((c) => ({
    stage: c.stage,
    title: c.title,
    total: 0,
    rd: 0,
    atencao: 0,
    parados: 0,
    paradosRd: 0,
  }));
  return { funnel: { key, title, total: 0, rd: 0, parados: 0, paradosRd: 0, rows } as DashboardFunnel, byStage: new Map(rows.map((r) => [r.stage, r])) };
}

export function summarizePipelineForDashboard(leads: readonly DashboardLead[]): DashboardPipelineSummary {
  const vendas = emptyFunnel("vendas", "Vendas", SALES_PIPELINE_COLUMNS);
  const posVenda = emptyFunnel("pos_venda", "Pós-venda", POS_VENDA_PIPELINE_COLUMNS);

  const emNegociacao = { total: 0, crm: 0, rd: 0 };
  const parados = { total: 0, pior: null as { title: string; dias: number } | null };
  let rdSemMovimento = 0;
  let perdidos = 0;
  let aguardandoAssinatura = 0;
  let dueComAjustes = 0;
  let rdMigracaoPendente = 0;

  for (const lead of leads) {
    if (lead.rdMigracaoPendente) rdMigracaoPendente += 1;

    const situacao = getLeadPipelineSituation(lead);
    if (situacao === "perdidas") {
      perdidos += 1;
      continue;
    }

    const target = vendas.byStage.has(lead.etapa) ? vendas : posVenda.byStage.has(lead.etapa) ? posVenda : null;
    // "Cadastro do lead" fica fora dos dois quadros, como no kanban.
    if (!target) continue;

    const row = target.byStage.get(lead.etapa)!;
    const isRd = lead.origemRd === true;
    row.total += 1;
    target.funnel.total += 1;
    if (isRd) {
      row.rd += 1;
      target.funnel.rd += 1;
    }

    if (target === vendas && situacao === "em_andamento") {
      emNegociacao.total += 1;
      if (isRd) emNegociacao.rd += 1;
      else emNegociacao.crm += 1;
    }

    // Assinatura pelo D4Sign do CRM: negócio do RD não passa por aqui.
    if (lead.etapa === "contrato_enviado" && situacao === "em_andamento" && !isRd) aguardandoAssinatura += 1;
    if (lead.dueReviewAdjustments?.some((a) => !a.adjustmentCompletedAt)) dueComAjustes += 1;

    if (STAGES_SEM_PRAZO.has(lead.etapa)) continue;
    const status = getDwellTrafficStatus(lead.diasNaEtapa, lead.etapa);
    if (isRd) {
      if (status === "critical") {
        row.paradosRd += 1;
        target.funnel.paradosRd += 1;
        rdSemMovimento += 1;
      }
      continue;
    }
    if (status === "warning") row.atencao += 1;
    if (status === "critical") {
      row.parados += 1;
      target.funnel.parados += 1;
      parados.total += 1;
      const dias = lead.diasNaEtapa ?? 0;
      if (!parados.pior || dias > parados.pior.dias) parados.pior = { title: row.title, dias };
    }
  }

  return {
    vendas: vendas.funnel,
    posVenda: posVenda.funnel,
    emNegociacao,
    perdidos,
    atencao: { parados, rdSemMovimento, aguardandoAssinatura, dueComAjustes, rdMigracaoPendente },
  };
}

export interface FunnelPhase {
  key: string;
  title: string;
  /** Leads que chegaram a esta fase ou passaram dela (inclusive os perdidos mais adiante). */
  chegaram: number;
  /** Participação no total de leads (0–100, arredondada). */
  pctDoTotal: number;
  /** Quantos da fase seguiram para a próxima (0–100); `null` na última. */
  passagemPct: number | null;
  /** Perdidos enquanto estavam nesta fase. */
  perdidos: number;
}

export interface ConversionFunnel {
  /** Todos os leads (CRM e RD, inclusive perdidos): a boca do funil. */
  total: number;
  /** Chegaram a contrato assinado (inclui o pós-venda e os ganhos marcados à mão). */
  fechados: number;
  /** Fechados sobre o total (0–100, arredondada). */
  conversaoPct: number;
  phases: FunnelPhase[];
}

/** Fases do funil de vendas na ordem do fluxo; cada uma começa numa etapa do kanban. */
const FUNNEL_PHASES: { key: string; title: string; desde: OpportunityStage }[] = [
  { key: "entrada", title: "Leads cadastrados", desde: "cadastro_lead" },
  // Sem due diligence o lead vai do cadastro direto para a reunião (`getAllowedJourney`).
  { key: "analise", title: "Due diligence ou reunião", desde: "levantamento_dados" },
  { key: "proposta", title: "Proposta em elaboração", desde: "confeccao_proposta" },
  { key: "proposta_enviada", title: "Proposta enviada", desde: "proposta_enviada" },
  { key: "contrato", title: "Contrato", desde: "confeccao_contrato" },
  { key: "fechado", title: "Contrato assinado", desde: "contrato_assinado" },
];

/**
 * Funil de conversão: por onde os leads entram e até onde chegam. Cada lead conta em todas as
 * fases até a da etapa em que está (ou em que foi perdido); ganho marcado à mão conta até o fim.
 */
export function buildConversionFunnel(leads: readonly Pick<Oportunidade, "etapa" | "encerramento">[]): ConversionFunnel {
  const inicio = FUNNEL_PHASES.map((p) => stageIndex(p.desde));
  const chegaram = FUNNEL_PHASES.map(() => 0);
  const perdidos = FUNNEL_PHASES.map(() => 0);
  const ultima = FUNNEL_PHASES.length - 1;

  for (const lead of leads) {
    const idx = stageIndex(lead.etapa);
    if (idx < 0) continue;
    let fase = 0;
    for (let k = 0; k < inicio.length; k++) if (idx >= inicio[k]) fase = k;
    if (lead.encerramento === "ganho") fase = ultima;
    for (let k = 0; k <= fase; k++) chegaram[k] += 1;
    if (lead.encerramento === "perdido") perdidos[fase] += 1;
  }

  const total = chegaram[0];
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  return {
    total,
    fechados: chegaram[ultima],
    conversaoPct: pct(chegaram[ultima], total),
    phases: FUNNEL_PHASES.map((p, k) => ({
      key: p.key,
      title: p.title,
      chegaram: chegaram[k],
      pctDoTotal: pct(chegaram[k], total),
      passagemPct: k < ultima ? pct(chegaram[k + 1], chegaram[k]) : null,
      perdidos: perdidos[k],
    })),
  };
}

/** Oportunidades em andamento: todas as etapas, sem as perdidas (como a situação do kanban). */
export function countActiveLeads(leads: readonly Pick<Oportunidade, "etapa" | "encerramento">[]): number {
  return leads.filter((l) => getLeadPipelineSituation(l) !== "perdidas").length;
}
