import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { normalizeD4SignSignersForKanban } from "@/lib/crm/d4sign-kanban-signers";
import { resolvePipelineEtapaFromDbAndRd } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import {
  getDueAreaReviewSummaryWithBreakdown,
  getDueAreaTasksSummaryWithBreakdown,
  type DueAreaTaskSummary,
} from "@/lib/crm/due-area-tasks";
import { getCrmUserDirectory, getRdReconciliationSummaries } from "@/lib/crm/kanban-data-cache";
import { resolveSolicitanteInternoDisplay } from "@/lib/crm/resolve-app-user-display";
import type { SignerAppUserLookup } from "@/lib/crm/signer-avatar-catalog";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectInChunks } from "@/lib/supabase/select-in-chunks";
import type { Oportunidade } from "@/modules/crm/domain/entities";

type LeadApiRecord = Oportunidade;

/** Só as colunas que o kanban usa (o `*` trazia o que a tela não lê). */
const OPPORTUNITY_COLUMNS =
  "id, cliente_id, contrato_base_id, tipo, etapa, havera_due_diligence, solicitante_nome, solicitante_email, criado_por, created_at, updated_at, encerramento, link_proposta, link_contrato, d4sign_signers, d4sign_updated_at, d4sign_status, d4sign_document_uuid, due_revision_cycle";

const CONTRACT_KANBAN_STAGES = new Set([
  "confeccao_contrato",
  "contrato_elaborado",
  "contrato_enviado",
  "contrato_assinado",
]);

type DueReviewAdjustment = {
  areaKey: string;
  observacaoAjustes: string | null;
  respondedAt: string | null;
  adjustmentCompletedAt: string | null;
};

type PropostaEscopoBreakdownRow = {
  areaKey: string;
  concluido: boolean;
};

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function calendarDaysBetween(fromIso: string, to: Date): number | null {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const diffMs = end - start;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function parseEncerramento(value: unknown): Oportunidade["encerramento"] | undefined {
  if (value === "ganho" || value === "perdido") return value;
  return undefined;
}

function mapOpportunity(row: {
  id: string;
  cliente_id: string | null;
  contrato_base_id: string | null;
  tipo: Oportunidade["tipo"];
  etapa: Oportunidade["etapa"];
  havera_due_diligence: boolean;
  solicitante_nome: string;
  created_at: string;
  updated_at: string;
  encerramento?: string | null;
  link_proposta?: string | null;
  link_contrato?: string | null;
  /** Repassado no spread da linha do Supabase; não entra no payload final. */
  criado_por?: string | null;
  solicitante_email?: string | null;
  solicitanteRd: string | null;
  rdOwnerEmail: string | null;
  ownerUserId: string | null;
  ownerUserName: string | null;
  ownerUserAvatarUrl: string | null;
  solicitanteUsuarioId: string | null;
  solicitanteUsuarioNome: string | null;
  solicitanteUsuarioAvatarUrl: string | null;
  origemRd: boolean;
  rdDealAtualizadoEm: string | null;
  motivoPerda: string | null;
  dueAreaTasksSummary?: DueAreaTaskSummary | null;
  dueAreaReviewSummary?: { total: number; reviewed: number; pending: number } | null;
  dueReviewAdjustments?: DueReviewAdjustment[] | null;
  localReuniao?: string | null;
  dataReuniao?: string | null;
  horarioReuniao?: string | null;
  propostaEscopoSummary?: { total: number; concluido: number; pendente: number } | null;
  propostaEscopoBreakdown?: PropostaEscopoBreakdownRow[] | null;
}): LeadApiRecord {
  const referenceIso = row.origemRd
    ? row.rdDealAtualizadoEm ?? row.updated_at
    : row.updated_at;
  const diasNaEtapa = calendarDaysBetween(referenceIso, new Date());

  const encerramento = parseEncerramento(row.encerramento);

  return {
    id: row.id,
    clienteId: row.cliente_id ?? undefined,
    contratoBaseId: row.contrato_base_id ?? undefined,
    tipo: row.tipo,
    etapa: row.etapa,
    haveraDueDiligence: row.havera_due_diligence,
    solicitante: row.solicitante_nome,
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    solicitanteRd: row.solicitanteRd,
    diasNaEtapa,
    origemRd: row.origemRd,
    rdDealAtualizadoEm: row.rdDealAtualizadoEm,
    motivoPerda: row.motivoPerda,
    rdOwnerEmail: row.rdOwnerEmail,
    ownerUserId: row.ownerUserId,
    ownerUserName: row.ownerUserName,
    ownerUserAvatarUrl: row.ownerUserAvatarUrl,
    solicitanteUsuarioId: row.solicitanteUsuarioId,
    solicitanteUsuarioNome: row.solicitanteUsuarioNome,
    solicitanteUsuarioAvatarUrl: row.solicitanteUsuarioAvatarUrl,
    ...(encerramento ? { encerramento } : {}),
    linkProposta: row.link_proposta?.trim() ? row.link_proposta : null,
    linkContrato: row.link_contrato?.trim() ? row.link_contrato : null,
    d4signSigners: normalizeD4SignSignersForKanban(
      (row as Record<string, unknown>).d4sign_signers,
    ),
    d4signUpdatedAt:
      typeof (row as Record<string, unknown>).d4sign_updated_at === "string"
        ? ((row as Record<string, unknown>).d4sign_updated_at as string)
        : null,
    d4signStatus:
      typeof (row as Record<string, unknown>).d4sign_status === "string"
        ? ((row as Record<string, unknown>).d4sign_status as string)
        : null,
    d4signDocumentUuid:
      typeof (row as Record<string, unknown>).d4sign_document_uuid === "string"
        ? ((row as Record<string, unknown>).d4sign_document_uuid as string)
        : null,
    dueAreaTasksSummary: row.dueAreaTasksSummary ?? null,
    dueAreaReviewSummary: row.dueAreaReviewSummary ?? null,
    dueReviewAdjustments: row.dueReviewAdjustments ?? null,
    localReuniao: row.localReuniao ?? null,
    dataReuniao: row.dataReuniao ?? null,
    horarioReuniao: row.horarioReuniao ?? null,
    propostaEscopoSummary: row.propostaEscopoSummary ?? null,
    propostaEscopoBreakdown: row.propostaEscopoBreakdown ?? null,
  };
}

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    // Tudo que não depende dos ids dos leads sai junto. Snapshot do RD e usuários vêm do cache
    // (ver kanban-data-cache.ts); quais leads são do RD é lido na hora (só ids, leve).
    const [
      { data: opportunitiesRows, error: opportunitiesError },
      { data: rdLinkRows, error: rdLinkError },
      rdSummaries,
      directory,
    ] = await Promise.all([
      supabase
        .from("oportunidades")
        .select(OPPORTUNITY_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("rd_deal_reconciliacao").select("oportunidade_id").not("oportunidade_id", "is", null),
      getRdReconciliationSummaries(),
      getCrmUserDirectory(),
    ]);
    if (opportunitiesError) throw opportunitiesError;
    if (rdLinkError) throw rdLinkError;

    const rdOpportunityIds = new Set((rdLinkRows ?? []).map((row) => String(row.oportunidade_id)));

    const ownerByEmail = new Map<string, { id: string; fullName: string; avatarUrl: string | null }>();
    const usersByEmail: SignerAppUserLookup = {};
    for (const user of directory) {
      if (!user.email) continue;
      ownerByEmail.set(user.email, { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl });
      usersByEmail[user.email] = { fullName: user.fullName, avatarUrl: user.avatarUrl };
    }

    const rows = (opportunitiesRows ?? []).map((row) => {
      const origemRd = rdOpportunityIds.has(row.id);
      const rd = origemRd ? (rdSummaries[row.id] ?? null) : null;
      return { row, origemRd, rd, etapa: resolvePipelineEtapaFromDbAndRd(row.etapa, origemRd, rd?.details ?? null) };
    });

    const opportunityIds = rows.map(({ row }) => row.id);
    const dueOpportunityIds = rows.filter(({ row }) => row.havera_due_diligence).map(({ row }) => row.id);
    const cycleByOpportunityId = new Map<string, number>();
    for (const { row } of rows) {
      if (row.havera_due_diligence) cycleByOpportunityId.set(row.id, Number(row.due_revision_cycle) || 0);
    }
    const contractStageIds = rows.filter(({ etapa }) => CONTRACT_KANBAN_STAGES.has(etapa)).map(({ row }) => row.id);

    // Tudo que depende dos ids, em paralelo.
    const [
      { data: leadIntakeRows, error: leadIntakeError },
      { summary: dueAreaTasksSummary, breakdown: dueAreaTasksBreakdown },
      { summary: dueAreaReviewSummary, breakdown: dueAreaReviewBreakdown },
      { data: dueReviewRows },
      { data: propostaEscopoRows },
      { data: contractReviewRows },
    ] = await Promise.all([
      selectInChunks(opportunityIds, (ids) =>
        supabase
          .from("lead_intakes")
          .select("oportunidade_id, solicitante_nome, local_reuniao, data_reuniao, horario_reuniao")
          .in("oportunidade_id", ids),
      ),
      getDueAreaTasksSummaryWithBreakdown(supabase, dueOpportunityIds),
      getDueAreaReviewSummaryWithBreakdown(supabase, cycleByOpportunityId),
      selectInChunks(dueOpportunityIds, (ids) =>
        supabase
          .from("due_area_review_tasks")
          .select(
            "oportunidade_id, revision_cycle, area_key, observacao_ajustes, responded_at, adjustment_completed_at, status",
          )
          .in("oportunidade_id", ids)
          .eq("status", "ajustes_solicitados")
          .order("responded_at", { ascending: false }),
      ),
      selectInChunks(opportunityIds, (ids) =>
        supabase
          .from("proposta_escopo_solicitacao")
          .select("oportunidade_id, area_key, concluido_em")
          .in("oportunidade_id", ids),
      ),
      selectInChunks(contractStageIds, (ids) =>
        supabase
          .from("contract_review_tasks")
          .select("oportunidade_id, status, prazo_revisao, concluido_em")
          .in("oportunidade_id", ids),
      ),
    ]);
    if (leadIntakeError) throw leadIntakeError;

    const leadIntakeByOpportunity = new Map<
      string,
      {
        solicitanteNome: string | null;
        localReuniao: string | null;
        dataReuniao: string | null;
        horarioReuniao: string | null;
      }
    >();
    for (const row of leadIntakeRows ?? []) {
      leadIntakeByOpportunity.set(String(row.oportunidade_id), {
        solicitanteNome: row.solicitante_nome ? String(row.solicitante_nome) : null,
        localReuniao: row.local_reuniao ? String(row.local_reuniao) : null,
        dataReuniao: row.data_reuniao ? String(row.data_reuniao) : null,
        horarioReuniao: row.horario_reuniao
          ? String(row.horario_reuniao).slice(0, 5)
          : null,
      });
    }

    const opportunities = rows.map(({ row, origemRd, rd, etapa }) => {
      const solicitanteRdRaw = rd?.solicitante ?? null;
      const solicitanteRd =
        solicitanteRdRaw &&
        normalizeComparableText(solicitanteRdRaw) !==
          normalizeComparableText(row.solicitante_nome)
          ? solicitanteRdRaw
          : null;
      const rdOwnerEmail = rd?.cadastroRealizadoPor ? rd.cadastroRealizadoPor.toLowerCase() : null;
      const mappedOwner = rdOwnerEmail ? ownerByEmail.get(rdOwnerEmail) : null;
      const solicitanteEmail = row.solicitante_email?.trim().toLowerCase() ?? null;
      const solicitanteByEmail = solicitanteEmail
        ? ownerByEmail.get(solicitanteEmail)
        : null;
      const solicitanteDisplay = resolveSolicitanteInternoDisplay({
        nomeCadastro:
          leadIntakeByOpportunity.get(row.id)?.solicitanteNome ?? null,
        solicitanteEmail,
        usersByEmail,
      });

      return mapOpportunity({
        ...row,
        etapa,
        solicitanteRd,
        rdOwnerEmail,
        ownerUserId: mappedOwner?.id ?? null,
        ownerUserName: mappedOwner?.fullName ?? null,
        ownerUserAvatarUrl: mappedOwner?.avatarUrl ?? null,
        solicitanteUsuarioId: solicitanteByEmail?.id ?? null,
        solicitanteUsuarioNome:
          solicitanteDisplay.nome === "—" ? null : solicitanteDisplay.nome,
        solicitanteUsuarioAvatarUrl: solicitanteDisplay.avatarUrl,
        origemRd,
        rdDealAtualizadoEm: rd?.rdDealAtualizadoEm ?? null,
        motivoPerda: rd?.motivoPerda ?? null,
      });
    });

    const dueReviewAdjustmentsByOpportunity = new Map<string, DueReviewAdjustment[]>();
    for (const row of dueReviewRows ?? []) {
      const oid = String(row.oportunidade_id);
      const currentCycle = cycleByOpportunityId.get(oid) ?? 0;
      const rowCycle = Number(row.revision_cycle) || 0;
      if (currentCycle < 1 || rowCycle !== currentCycle) continue;
      const list = dueReviewAdjustmentsByOpportunity.get(oid) ?? [];
      list.push({
        areaKey: String(row.area_key),
        observacaoAjustes: row.observacao_ajustes ? String(row.observacao_ajustes) : null,
        respondedAt: row.responded_at ? String(row.responded_at) : null,
        adjustmentCompletedAt: row.adjustment_completed_at ? String(row.adjustment_completed_at) : null,
      });
      dueReviewAdjustmentsByOpportunity.set(oid, list);
    }

    const propostaEscopoSummaryByOpportunity = new Map<
      string,
      { total: number; concluido: number; pendente: number }
    >();
    const propostaEscopoBreakdownByOpportunity = new Map<string, PropostaEscopoBreakdownRow[]>();
    for (const row of propostaEscopoRows ?? []) {
      const oid = String(row.oportunidade_id);
      const concluido = Boolean(row.concluido_em);
      const summary = propostaEscopoSummaryByOpportunity.get(oid) ?? {
        total: 0,
        concluido: 0,
        pendente: 0,
      };
      summary.total += 1;
      if (concluido) summary.concluido += 1;
      else summary.pendente += 1;
      propostaEscopoSummaryByOpportunity.set(oid, summary);

      const breakdown = propostaEscopoBreakdownByOpportunity.get(oid) ?? [];
      breakdown.push({
        areaKey: String(row.area_key),
        concluido,
      });
      propostaEscopoBreakdownByOpportunity.set(oid, breakdown);
    }
    for (const [, breakdown] of propostaEscopoBreakdownByOpportunity) {
      breakdown.sort((a, b) => a.areaKey.localeCompare(b.areaKey, "pt-BR", { sensitivity: "base" }));
    }

    const contractReviewByOpportunity = new Map<
      string,
      NonNullable<Oportunidade["contractReviewSummary"]>
    >();
    for (const row of contractReviewRows ?? []) {
      const status = String(row.status);
      if (status !== "pendente" && status !== "em_revisao" && status !== "concluido") continue;
      contractReviewByOpportunity.set(String(row.oportunidade_id), {
        status,
        prazoRevisao: row.prazo_revisao ? String(row.prazo_revisao) : null,
        concluidoEm: row.concluido_em ? String(row.concluido_em) : null,
      });
    }

    return NextResponse.json({
      ok: true,
      opportunities: opportunities.map((op) => ({
        ...op,
        ...(leadIntakeByOpportunity.get(op.id) ?? {
          localReuniao: null,
          dataReuniao: null,
          horarioReuniao: null,
        }),
        dueAreaTasksSummary: dueAreaTasksSummary.get(op.id) ?? null,
        dueAreaTasksBreakdown: dueAreaTasksBreakdown.get(op.id) ?? null,
        dueAreaReviewSummary: dueAreaReviewSummary.get(op.id) ?? null,
        dueAreaReviewBreakdown: dueAreaReviewBreakdown.get(op.id) ?? null,
        dueReviewAdjustments: dueReviewAdjustmentsByOpportunity.get(op.id) ?? null,
        propostaEscopoSummary: propostaEscopoSummaryByOpportunity.get(op.id) ?? null,
        propostaEscopoBreakdown: propostaEscopoBreakdownByOpportunity.get(op.id) ?? null,
        contractReviewSummary: contractReviewByOpportunity.get(op.id) ?? null,
      })),
      owners: directory
        .filter((user) => user.email)
        .map((user) => ({
          id: user.id,
          name: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    });
  } catch (error) {
    return internalErrorResponse("crm/leads", error, "Falha inesperada ao carregar leads.");
  }
}
