import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { normalizeD4SignSignersForKanban } from "@/lib/crm/d4sign-kanban-signers";
import { resolvePipelineEtapaFromDbAndRd } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import {
  getDueAreaReviewSummaryWithBreakdown,
  getDueAreaTasksSummaryWithBreakdown,
  type DueAreaTaskSummary,
} from "@/lib/crm/due-area-tasks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Oportunidade } from "@/modules/crm/domain/entities";

type LeadApiRecord = Oportunidade;

interface SystemUser {
  id: string;
  fullName: string;
  email: string | null;
}

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

function normalizeLabel(label: string): string {
  return label
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getDealCustomFieldValue(
  details: unknown,
  labels: string[],
): string | null {
  if (!details || typeof details !== "object") return null;
  const detailsObj = details as Record<string, unknown>;
  const deal =
    detailsObj.deal && typeof detailsObj.deal === "object"
      ? (detailsObj.deal as Record<string, unknown>)
      : null;
  if (!deal || !Array.isArray(deal.deal_custom_fields)) {
    return null;
  }

  const targetLabels = labels.map(normalizeLabel);
  for (const field of deal.deal_custom_fields) {
    if (!field || typeof field !== "object") continue;
    const row = field as Record<string, unknown>;
    const customField =
      row.custom_field && typeof row.custom_field === "object"
        ? (row.custom_field as Record<string, unknown>)
        : null;
    const rawLabel = asString(customField?.label) ?? asString(row.label);
    if (!rawLabel) continue;
    if (!targetLabels.includes(normalizeLabel(rawLabel))) continue;
    const value = asString(row.value) ?? asString(row.content);
    if (value) return value;
  }

  return null;
}

function getRdDealUpdatedAtIso(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const root = details as Record<string, unknown>;
  const deal =
    root.deal && typeof root.deal === "object"
      ? (root.deal as Record<string, unknown>)
      : null;
  if (!deal) return null;
  const raw = asString(deal.updated_at) ?? asString(deal.updatedAt);
  return raw?.trim() ? raw : null;
}

function getRdDealLostReason(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const root = details as Record<string, unknown>;
  const deal =
    root.deal && typeof root.deal === "object"
      ? (root.deal as Record<string, unknown>)
      : null;
  if (!deal) return null;

  const lostReason =
    deal.deal_lost_reason && typeof deal.deal_lost_reason === "object"
      ? (deal.deal_lost_reason as Record<string, unknown>)
      : null;
  if (!lostReason) return null;

  return asString(lostReason.name) ?? asString(lostReason.reason) ?? null;
}

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
    const [{ data: opportunitiesRows, error: opportunitiesError }, { data: usersRows, error: usersError }, authUsersResult] = await Promise.all([
      supabase
        .from("oportunidades")
        // `*` evita 500 quando a coluna `encerramento` ainda não foi aplicada na base; após a migration ela passa a vir no payload.
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("app_users").select("id, full_name, auth_user_id, avatar_url"),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (opportunitiesError) {
      throw opportunitiesError;
    }
    if (usersError) {
      throw usersError;
    }
    if (authUsersResult.error) {
      throw authUsersResult.error;
    }

    const opportunityIdSet = new Set((opportunitiesRows ?? []).map((r) => r.id));
    const { data: reconciliationRows, error: reconciliationError } = await supabase
      .from("rd_deal_reconciliacao")
      .select("oportunidade_id, detalhes, reconciled_at")
      .not("oportunidade_id", "is", null)
      .order("reconciled_at", { ascending: false });

    if (reconciliationError) {
      throw reconciliationError;
    }

    const authEmailById = new Map<string, string>();
    for (const authUser of authUsersResult.data.users) {
      if (authUser.id && authUser.email) {
        authEmailById.set(authUser.id, authUser.email.toLowerCase());
      }
    }

    const systemUsers: SystemUser[] = (usersRows ?? []).map((user) => ({
      id: user.id,
      fullName: user.full_name,
      email: authEmailById.get(user.auth_user_id) ?? null,
    }));

    const userRowById = new Map<
      string,
      { full_name: string; avatar_url: string | null }
    >();
    for (const u of usersRows ?? []) {
      userRowById.set(u.id, { full_name: u.full_name, avatar_url: u.avatar_url });
    }

    const ownerByEmail = new Map<
      string,
      { id: string; fullName: string; avatarUrl: string | null }
    >();
    for (const user of systemUsers) {
      if (user.email) {
        const row = userRowById.get(user.id);
        ownerByEmail.set(user.email.toLowerCase(), {
          id: user.id,
          fullName: user.fullName,
          avatarUrl: row?.avatar_url ?? null,
        });
      }
    }

    function resolveSolicitanteUsuario(
      criadoPor: string | null,
      solicitanteEmail: string | null,
    ): { id: string | null; nome: string | null; avatarUrl: string | null } {
      if (criadoPor && userRowById.has(criadoPor)) {
        const u = userRowById.get(criadoPor)!;
        return { id: criadoPor, nome: u.full_name, avatarUrl: u.avatar_url };
      }
      const emailKey = solicitanteEmail?.trim().toLowerCase();
      if (emailKey) {
        const byMail = ownerByEmail.get(emailKey);
        if (byMail) {
          return {
            id: byMail.id,
            nome: byMail.fullName,
            avatarUrl: byMail.avatarUrl,
          };
        }
      }
      return { id: null, nome: null, avatarUrl: null };
    }

    const reconciliationByOpportunity = new Map<string, unknown>();
    for (const row of reconciliationRows ?? []) {
      const oid = row.oportunidade_id ? String(row.oportunidade_id) : "";
      if (!oid || !opportunityIdSet.has(oid)) continue;
      if (!reconciliationByOpportunity.has(oid)) {
        reconciliationByOpportunity.set(oid, row.detalhes);
      }
    }

    const opportunities = (opportunitiesRows ?? []).map((row) => {
      const origemRd = reconciliationByOpportunity.has(row.id);
      const reconciliationDetails = reconciliationByOpportunity.get(row.id);
      const rdDealAtualizadoEm = getRdDealUpdatedAtIso(reconciliationDetails);
      const motivoPerda = getRdDealLostReason(reconciliationDetails);
      const rdOwnerEmailRaw = getDealCustomFieldValue(reconciliationDetails, [
        "Cadastro realizado por",
        "Cadastro realizado por (e-mail)",
      ]);
      const solicitanteRdRaw = getDealCustomFieldValue(reconciliationDetails, [
        "Solicitante",
        "Nome do solicitante",
        "Solicitante (nome)",
      ]);
      const solicitanteRd =
        solicitanteRdRaw &&
        normalizeComparableText(solicitanteRdRaw) !==
          normalizeComparableText(row.solicitante_nome)
          ? solicitanteRdRaw
          : null;
      const rdOwnerEmail = rdOwnerEmailRaw ? rdOwnerEmailRaw.toLowerCase() : null;
      const mappedOwner = rdOwnerEmail ? ownerByEmail.get(rdOwnerEmail) : null;
      const solicitanteUsuario = resolveSolicitanteUsuario(
        row.criado_por ?? null,
        row.solicitante_email ?? null,
      );

      const etapa = resolvePipelineEtapaFromDbAndRd(
        row.etapa,
        origemRd,
        reconciliationDetails,
      );

      return mapOpportunity({
        ...row,
        etapa,
        solicitanteRd,
        rdOwnerEmail,
        ownerUserId: mappedOwner?.id ?? null,
        ownerUserName: mappedOwner?.fullName ?? null,
        ownerUserAvatarUrl: mappedOwner?.avatarUrl ?? null,
        solicitanteUsuarioId: solicitanteUsuario.id,
        solicitanteUsuarioNome: solicitanteUsuario.nome,
        solicitanteUsuarioAvatarUrl: solicitanteUsuario.avatarUrl,
        origemRd,
        rdDealAtualizadoEm,
        motivoPerda,
      });
    });

    const opportunityIds = opportunities.map((op) => op.id);
    const { data: leadIntakeRows } = await supabase
      .from("lead_intakes")
      .select("oportunidade_id, local_reuniao, data_reuniao, horario_reuniao")
      .in("oportunidade_id", opportunityIds);
    const leadIntakeByOpportunity = new Map<
      string,
      { localReuniao: string | null; dataReuniao: string | null; horarioReuniao: string | null }
    >();
    for (const row of leadIntakeRows ?? []) {
      leadIntakeByOpportunity.set(String(row.oportunidade_id), {
        localReuniao: row.local_reuniao ? String(row.local_reuniao) : null,
        dataReuniao: row.data_reuniao ? String(row.data_reuniao) : null,
        horarioReuniao: row.horario_reuniao ? String(row.horario_reuniao).slice(0, 5) : null,
      });
    }

    const dueOpportunityIds = opportunities.filter((op) => op.haveraDueDiligence).map((op) => op.id);
    const cycleByOpportunityId = new Map<string, number>();
    for (const row of opportunitiesRows ?? []) {
      if (!row?.id || !dueOpportunityIds.includes(row.id)) continue;
      const cycle = Number(row.due_revision_cycle) || 0;
      cycleByOpportunityId.set(row.id, cycle);
    }

    const [
      { summary: dueAreaTasksSummary, breakdown: dueAreaTasksBreakdown },
      { summary: dueAreaReviewSummary, breakdown: dueAreaReviewBreakdown },
      { data: dueReviewRows },
    ] = await Promise.all([
      getDueAreaTasksSummaryWithBreakdown(supabase, dueOpportunityIds),
      getDueAreaReviewSummaryWithBreakdown(supabase, cycleByOpportunityId),
      supabase
        .from("due_area_review_tasks")
        .select(
          "oportunidade_id, revision_cycle, area_key, observacao_ajustes, responded_at, adjustment_completed_at, status",
        )
        .in("oportunidade_id", dueOpportunityIds)
        .eq("status", "ajustes_solicitados")
        .order("responded_at", { ascending: false }),
    ]);

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

    const { data: propostaEscopoRows } = await supabase
      .from("proposta_escopo_solicitacao")
      .select("oportunidade_id, area_key, concluido_em")
      .in("oportunidade_id", opportunityIds);
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

    const CONTRACT_KANBAN_STAGES = new Set([
      "confeccao_contrato",
      "contrato_elaborado",
      "contrato_enviado",
      "contrato_assinado",
    ]);
    const contractStageIds = opportunities
      .filter((op) => CONTRACT_KANBAN_STAGES.has(op.etapa))
      .map((op) => op.id);

    const contractReviewByOpportunity = new Map<
      string,
      NonNullable<Oportunidade["contractReviewSummary"]>
    >();
    if (contractStageIds.length > 0) {
      const { data: contractReviewRows } = await supabase
        .from("contract_review_tasks")
        .select("oportunidade_id, status, prazo_revisao, concluido_em")
        .in("oportunidade_id", contractStageIds);
      for (const row of contractReviewRows ?? []) {
        const status = String(row.status);
        if (status !== "pendente" && status !== "em_revisao" && status !== "concluido") continue;
        contractReviewByOpportunity.set(String(row.oportunidade_id), {
          status,
          prazoRevisao: row.prazo_revisao ? String(row.prazo_revisao) : null,
          concluidoEm: row.concluido_em ? String(row.concluido_em) : null,
        });
      }
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
      owners: systemUsers
        .filter((user) => user.email)
        .map((user) => {
          const row = userRowById.get(user.id);
          return {
            id: user.id,
            name: user.fullName,
            email: user.email,
            avatarUrl: row?.avatar_url ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao carregar leads.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
