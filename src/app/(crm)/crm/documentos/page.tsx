import { ClipboardList, FileCheck2, ShieldCheck } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import {
  fetchAppUsersByEmailLookup,
  resolveSolicitanteInternoDisplay,
} from "@/lib/crm/resolve-app-user-display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import {
  computeDuePunctuality,
  dueDeadlineInstantIso,
  formatDueDeadlineDisplay,
} from "@/lib/crm/due-diligence-deadline";
import type {
  DueAreaReviewTimelineRow,
  DueAreaTaskTimelineRow,
  TransicoesPrimeiraPorEtapa,
} from "@/lib/crm/due-diligence-timeline";
import { montarTimelineDueDiligence } from "@/lib/crm/due-diligence-timeline";
import { DueDiligencePanel, type DueDiligenceLeadRow } from "./due-diligence-panel";

const ETAPAS_TIMELINE_DUE = [
  "levantamento_dados",
  "compilacao",
  "revisao",
  "due_diligence_finalizada",
] as const;

const ETAPAS_TIMELINE_SET = new Set<string>(ETAPAS_TIMELINE_DUE);

type AppUserEmbed = { full_name: string; avatar_url: string | null } | null;
type LeadIntakeEmbed = {
  created_at: string;
  due_diligence: boolean;
  data_entrega_due: string | null;
  horario_entrega_due: string | null;
  cadastrado_por_email: string;
  solicitante_nome: string | null;
} | null;
type DueDocEmbed = {
  id: string;
  document_kind: string;
  original_filename: string;
  content_type: string | null;
  byte_size: number | null;
  uploaded_at: string;
};

export default async function CrmDueDiligencePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("app_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const role = profile?.role != null ? String(profile.role) : "";
  if (!["admin", "comercial"].includes(role)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[#dfe5ee] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#102033]">Sem permissão para esta área.</p>
        <p className="mt-2 text-sm text-slate-500">
          Apenas perfis comercial ou admin visualizam o painel de Due diligence.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();
  const usersByEmail = await fetchAppUsersByEmailLookup(admin);

  const { data: opRows, error: opError } = await supabase
    .from("oportunidades")
    .select(
      `
      id,
      solicitante_nome,
      solicitante_email,
      etapa,
      created_at,
      criado_por,
      havera_due_diligence,
      due_compilacao_entrada_em,
      due_revisao_entrada_em,
      criado_por_user:app_users!oportunidades_criado_por_fkey ( full_name, avatar_url ),
      lead_intakes!inner (
        created_at,
        due_diligence,
        data_entrega_due,
        horario_entrega_due,
        cadastrado_por_email,
        solicitante_nome
      ),
      due_documents (
        id,
        document_kind,
        original_filename,
        content_type,
        byte_size,
        uploaded_at
      )
    `,
    )
    .eq("havera_due_diligence", true)
    .order("created_at", { ascending: false })
    .limit(450);

  if (opError) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-red-600">
        Erro ao carregar negociações: {opError.message}
      </div>
    );
  }

  const opportunities = opRows ?? [];
  const ids = opportunities.map((r) => r.id).filter(Boolean);

  const transByOp = new Map<string, TransicoesPrimeiraPorEtapa>();
  const areaTasksByOp = new Map<string, DueAreaTaskTimelineRow[]>();
  const reviewTasksByOp = new Map<string, DueAreaReviewTimelineRow[]>();

  if (ids.length > 0) {
    const { data: transRows, error: transError } = await supabase
      .from("transicoes_etapa")
      .select("oportunidade_id, etapa_destino, criado_em")
      .in("oportunidade_id", ids)
      .in("etapa_destino", [...ETAPAS_TIMELINE_DUE])
      .order("criado_em", { ascending: true });

    if (transError) {
      return (
        <div className="mx-auto max-w-lg p-8 text-center text-sm text-red-600">
          Erro ao carregar histórico de etapas: {transError.message}
        </div>
      );
    }

    for (const row of transRows ?? []) {
      const oid = row.oportunidade_id;
      const dest = row.etapa_destino;
      if (!dest || !ETAPAS_TIMELINE_SET.has(dest)) continue;
      const stageKey = dest as keyof TransicoesPrimeiraPorEtapa;
      const cur = transByOp.get(oid) ?? {};
      if (cur[stageKey] == null) {
        cur[stageKey] = row.criado_em;
        transByOp.set(oid, cur);
      }
    }

    const { data: areaTaskRows, error: areaErr } = await supabase
      .from("due_area_tasks")
      .select(
        "oportunidade_id, area_key, status, iniciado_em, dados_disponibilizados_em, created_at, pasta_due_confirmada, sem_processos_ativos",
      )
      .in("oportunidade_id", ids);

    if (areaErr) {
      return (
        <div className="mx-auto max-w-lg p-8 text-center text-sm text-red-600">
          Erro ao carregar tarefas por área (levantamento): {areaErr.message}
        </div>
      );
    }

    for (const row of areaTaskRows ?? []) {
      const oid = row.oportunidade_id as string;
      const list = areaTasksByOp.get(oid) ?? [];
      list.push({
        area_key: row.area_key as string,
        status: row.status as string,
        iniciado_em: row.iniciado_em as string | null,
        dados_disponibilizados_em: row.dados_disponibilizados_em as string | null,
        created_at: row.created_at as string,
        pasta_due_confirmada: row.pasta_due_confirmada as boolean | null,
        sem_processos_ativos: row.sem_processos_ativos as boolean | null,
      });
      areaTasksByOp.set(oid, list);
    }

    const { data: reviewTaskRows, error: revErr } = await supabase
      .from("due_area_review_tasks")
      .select(
        "oportunidade_id, area_key, revision_cycle, status, created_at, review_started_at, adjustments_requested_at, approved_at, compilation_returned_at, revisao_reentry_at, review_elapsed_ms, compilation_elapsed_ms, responded_at",
      )
      .in("oportunidade_id", ids);

    if (revErr) {
      return (
        <div className="mx-auto max-w-lg p-8 text-center text-sm text-red-600">
          Erro ao carregar revisões por área: {revErr.message}
        </div>
      );
    }

    for (const row of reviewTaskRows ?? []) {
      const oid = row.oportunidade_id as string;
      const list = reviewTasksByOp.get(oid) ?? [];
      list.push({
        area_key: row.area_key as string,
        revision_cycle: Number(row.revision_cycle),
        status: row.status as string,
        created_at: row.created_at as string,
        review_started_at: row.review_started_at as string | null,
        adjustments_requested_at: row.adjustments_requested_at as string | null,
        approved_at: row.approved_at as string | null,
        compilation_returned_at: row.compilation_returned_at as string | null,
        revisao_reentry_at: row.revisao_reentry_at as string | null,
        review_elapsed_ms:
          row.review_elapsed_ms != null ? Number(row.review_elapsed_ms) : null,
        compilation_elapsed_ms:
          row.compilation_elapsed_ms != null ? Number(row.compilation_elapsed_ms) : null,
        responded_at: row.responded_at as string | null,
      });
      reviewTasksByOp.set(oid, list);
    }
  }

  const leads: DueDiligenceLeadRow[] = opportunities.map((r) => {
    const intake = r.lead_intakes as LeadIntakeEmbed | LeadIntakeEmbed[] | null | undefined;
    const intakeRow = Array.isArray(intake) ? intake[0] ?? null : intake ?? null;
    const creator = r.criado_por_user as AppUserEmbed | AppUserEmbed[] | undefined;
    const creatorRow = Array.isArray(creator) ? creator[0] ?? null : creator ?? null;

    const createdByLabel =
      creatorRow?.full_name?.trim() ||
      intakeRow?.cadastrado_por_email?.trim() ||
      "—";
    const createdByAvatarUrl = creatorRow?.avatar_url?.trim() || null;
    const solicitanteDisplay = resolveSolicitanteInternoDisplay({
      nomeCadastro: intakeRow?.solicitante_nome,
      solicitanteEmail: r.solicitante_email != null ? String(r.solicitante_email) : null,
      usersByEmail,
    });

    const trans = transByOp.get(r.id);
    const duePedidoEmIso = trans?.levantamento_dados ?? r.created_at ?? null;

    const dueFinalizadaEmIso = trans?.due_diligence_finalizada ?? null;

    const timeline = montarTimelineDueDiligence({
      transicoes: trans ?? {},
      fallbackInicioLevantamentoIso: r.created_at != null ? String(r.created_at) : null,
      dueCompilacaoEntradaEm: r.due_compilacao_entrada_em ?? null,
      dueRevisaoEntradaEm: r.due_revisao_entrada_em ?? null,
      areaTasks: areaTasksByOp.get(r.id) ?? [],
      reviewTasks: reviewTasksByOp.get(r.id) ?? [],
    });

    const prazoLabel = formatDueDeadlineDisplay(
      intakeRow?.data_entrega_due,
      intakeRow?.horario_entrega_due,
    );
    const deadlineIso = dueDeadlineInstantIso(
      intakeRow?.data_entrega_due,
      intakeRow?.horario_entrega_due,
    );
    const deadlineMs = deadlineIso ? Date.parse(deadlineIso) : NaN;
    const prazoEntregaSortKey = Number.isFinite(deadlineMs) ? deadlineMs : 9_000_000_000_000;

    const punctuality = computeDuePunctuality({
      deadlineIso,
      finalizadaIso: dueFinalizadaEmIso,
    });

    const rawDocs = r.due_documents as DueDocEmbed[] | null | undefined;
    const documents = [...(rawDocs ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

    const etapaKey = r.etapa != null ? String(r.etapa) : "";
    const faseAtualLabel =
      etapaKey && etapaKey in OPPORTUNITY_STAGE_LABELS
        ? OPPORTUNITY_STAGE_LABELS[etapaKey as keyof typeof OPPORTUNITY_STAGE_LABELS]
        : etapaKey || "—";

    return {
      oportunidadeId: r.id,
      etapa: String(r.etapa ?? ""),
      leadName: String(r.solicitante_nome ?? "").trim() || "—",
      solicitanteNome: solicitanteDisplay.nome,
      solicitanteAvatarUrl: solicitanteDisplay.avatarUrl,
      createdByLabel,
      createdByAvatarUrl,
      duePedidoEmIso,
      dueFinalizadaEmIso,
      prazoEntregaLabel: prazoLabel,
      prazoEntregaSortKey,
      punctuality,
      faseAtualLabel,
      timeline,
      documents: documents.map((d) => ({
        id: d.id,
        documentKind: d.document_kind,
        originalFilename: d.original_filename,
        contentType: d.content_type,
        byteSize: d.byte_size != null ? Number(d.byte_size) : null,
        uploadedAt: d.uploaded_at,
      })),
    };
  });

  const emAndamento = leads.filter((L) => !L.dueFinalizadaEmIso).length;
  const emAtraso = leads.filter((L) => L.punctuality.kind === "em_atraso").length;
  const finalizadas = leads.filter((L) => !!L.dueFinalizadaEmIso).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <CrmPageHeader
        eyebrow="Operações"
        title="Due diligence"
        description="Acompanhe cada negociação com due diligence: em que fase está, se o prazo combinado foi cumprido e quais documentos já foram anexados."
        icon={ClipboardList}
        badges={[
          { label: "Cadastro neste CRM", icon: ShieldCheck },
          { label: "Importações RD fora desta lista", icon: FileCheck2 },
        ]}
        stats={[
          { label: "Total", value: leads.length },
          {
            label: "Em andamento",
            value: emAndamento,
            detail: "Ainda não finalizada no funil",
          },
          {
            label: "Em atraso",
            value: emAtraso,
            detail: "Prazo combinado já passou",
          },
          {
            label: "Finalizadas",
            value: finalizadas,
            detail: "Etapa due diligence concluída",
          },
        ]}
      />

      <DueDiligencePanel leads={leads} />
    </div>
  );
}
