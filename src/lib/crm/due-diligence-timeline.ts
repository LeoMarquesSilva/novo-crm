import { isDueAreaTaskDelivered } from "@/lib/crm/due-area-tasks";

/** Primeira transição por etapa (criado_em ISO). */
export type TransicoesPrimeiraPorEtapa = Partial<
  Record<"levantamento_dados" | "compilacao" | "revisao" | "due_diligence_finalizada", string>
>;

export type DueAreaTaskTimelineRow = {
  area_key: string;
  status: string;
  iniciado_em: string | null;
  dados_disponibilizados_em: string | null;
  created_at: string;
  pasta_due_confirmada: boolean | null;
  sem_processos_ativos: boolean | null;
};

export type DueAreaReviewTimelineRow = {
  area_key: string;
  revision_cycle: number;
  status: string;
  created_at: string;
  review_started_at: string | null;
  adjustments_requested_at: string | null;
  approved_at: string | null;
  compilation_returned_at: string | null;
  revisao_reentry_at: string | null;
  review_elapsed_ms: number | null;
  compilation_elapsed_ms: number | null;
  responded_at: string | null;
};

export type DueFaseResumo = {
  key: string;
  titulo: string;
  inicioIso: string | null;
  fimIso: string | null;
  duracaoMs: number | null;
};

export type DueAreaTempo = {
  fase: "levantamento" | "revisao";
  area: string;
  cicloRevisao?: number;
  inicioIso: string | null;
  fimIso: string | null;
  duracaoMs: number | null;
  situacao: string;
};

export type DueDiligenceTimeline = {
  fases: DueFaseResumo[];
  areasLevantamento: DueAreaTempo[];
  areasRevisao: DueAreaTempo[];
};

function menorIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const xs = [a, b].filter((x): x is string => Boolean(x && String(x).trim()));
  if (xs.length === 0) return null;
  return xs.sort((x, y) => Date.parse(x) - Date.parse(y))[0] ?? null;
}

function duracaoMsEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const ms = Date.parse(fim) - Date.parse(inicio);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

/** Formata duração para exibição em pt-BR (ex.: "2 dias e 4 h", "45 min"). */
export function formatarDuracaoBr(ms: number | null): string {
  if (ms == null) return "—";
  const totalMin = Math.round(ms / 60000);
  if (totalMin <= 0) return "< 1 min";
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 24 * 60) / 60);
  const mins = totalMin % 60;
  const partes: string[] = [];
  if (days > 0) partes.push(`${days} ${days === 1 ? "dia" : "dias"}`);
  if (hours > 0) partes.push(`${hours} h`);
  if (mins > 0 && days === 0) partes.push(`${mins} min`);
  if (partes.length === 0) return "< 1 min";
  return partes.join(" e ");
}

export function montarTimelineDueDiligence(input: {
  transicoes: TransicoesPrimeiraPorEtapa;
  /**
   * Quando não existe transição para `levantamento_dados` em `transicoes_etapa`,
   * usa-se a criação da oportunidade — o mesmo critério do cartão "Due pedida / início".
   */
  fallbackInicioLevantamentoIso: string | null;
  dueCompilacaoEntradaEm: string | null;
  dueRevisaoEntradaEm: string | null;
  areaTasks: DueAreaTaskTimelineRow[];
  reviewTasks: DueAreaReviewTimelineRow[];
}): DueDiligenceTimeline {
  const tLev = input.transicoes.levantamento_dados ?? input.fallbackInicioLevantamentoIso ?? null;
  const tComp = menorIso(input.transicoes.compilacao, input.dueCompilacaoEntradaEm);
  const tRev = menorIso(input.transicoes.revisao, input.dueRevisaoEntradaEm);
  const tFin = input.transicoes.due_diligence_finalizada ?? null;

  const fases: DueFaseResumo[] = [
    {
      key: "levantamento",
      titulo: "Levantamento de dados",
      inicioIso: tLev,
      fimIso: tComp,
      duracaoMs: duracaoMsEntre(tLev, tComp),
    },
    {
      key: "compilacao",
      titulo: "Compilação",
      inicioIso: tComp,
      fimIso: tRev,
      duracaoMs: duracaoMsEntre(tComp, tRev),
    },
    {
      key: "revisao",
      titulo: "Revisão",
      inicioIso: tRev,
      fimIso: tFin,
      duracaoMs: duracaoMsEntre(tRev, tFin),
    },
  ];

  const areasLevantamento: DueAreaTempo[] = [...input.areaTasks]
    .sort((a, b) => a.area_key.localeCompare(b.area_key, "pt-BR"))
    .map((row) => {
      const inicio = row.iniciado_em ?? row.created_at;
      const entregue = isDueAreaTaskDelivered({
        status: row.status,
        pasta_due_confirmada: row.pasta_due_confirmada,
        sem_processos_ativos: row.sem_processos_ativos,
      });
      const fim = entregue ? row.dados_disponibilizados_em : null;
      const duracaoMs = fim ? duracaoMsEntre(inicio, fim) : null;
      let situacao = "Em aberto";
      if (entregue && fim) situacao = "Entregue";
      else if (row.status === "disponibilizado" && !entregue) situacao = "Pendente de confirmação";
      return {
        fase: "levantamento" as const,
        area: row.area_key,
        inicioIso: inicio,
        fimIso: fim,
        duracaoMs,
        situacao,
      };
    });

  const areasRevisao: DueAreaTempo[] = [...input.reviewTasks]
    .sort((a, b) => {
      const c = a.revision_cycle - b.revision_cycle;
      if (c !== 0) return c;
      return a.area_key.localeCompare(b.area_key, "pt-BR");
    })
    .map((row) => {
      const inicio = row.review_started_at ?? row.created_at;
      const fim = row.responded_at;
      const duracaoMs = row.review_elapsed_ms ?? (fim ? duracaoMsEntre(inicio, fim) : null);
      let situacao = "Em aberto";
      if (row.responded_at) {
        situacao =
          row.status === "ajustes_solicitados"
            ? "Respondida (ajustes solicitados)"
            : "Respondida (OK)";
      } else if (row.status === "pendente") situacao = "Aguardando área";
      if (row.status === "ajustes_solicitados" && row.compilation_elapsed_ms != null) {
        situacao = "Ajustes solicitados (tempo em compilação calculado)";
      }
      return {
        fase: "revisao" as const,
        area: row.area_key,
        cicloRevisao: row.revision_cycle,
        inicioIso: inicio,
        fimIso: fim,
        duracaoMs,
        situacao,
      };
    });

  return { fases, areasLevantamento, areasRevisao };
}
