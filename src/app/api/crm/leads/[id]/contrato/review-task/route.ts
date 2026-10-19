/**
 * POST /api/crm/leads/[id]/contrato/review-task
 *
 * Cria ou atualiza a tarefa de revisão de contrato para um lead.
 * Quando um prazo for informado, dispara notificações in-app para todos os
 * usuários com `area = 'Societário e Contratos'`.
 *
 * PATCH /api/crm/leads/[id]/contrato/review-task
 * Atualiza status (em_revisao | concluido) + observação. Concluem: admin, comercial,
 * a área Societário e Contratos e quem foi designado (`contract.review.update`).
 * A conclusão grava quem aprovou (`approved_by`) e a versão gerada revisada
 * (`document_version_id`, a mais recente com arquivo no storage).
 * Ao concluir em `confeccao_contrato`, o lead vai para `contrato_elaborado` pelo
 * RPC `transition_opportunity_atomic`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CONTRACT_REVIEW_AREA_ALIASES, evaluateLeadAction } from "@/lib/auth/crm-access-policy";
import { forbiddenResponse, requireCrmActorApi, requireLeadActionApi } from "@/lib/auth/crm-actor";
import { requireAuthApi } from "@/lib/auth/server";
import { buildAtomicTransitionRpcArgs } from "@/lib/crm/atomic-transition";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { formatDateYmdBr, parseDateOnlyInput, saoPauloMidnightIso } from "@/lib/format-datetime";
import { internalErrorResponse, logServerError } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readStoredEngine } from "@/lib/crm/contract-engine/persist";
import { loadDefaultContratoTemplate } from "@/lib/crm/proposta-document-data";
import { findLatestStoredGeneratedDocumentVersion } from "@/lib/crm/workflow-transition-evidence";

const upsertSchema = z.object({
  prazoRevisao: z.string().min(1).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
});

const patchSchema = z.object({
  status: z.enum(["pendente", "em_revisao", "concluido"]).optional(),
  observacao: z.string().max(2000).optional().nullable(),
});

// ─── POST: criar ou upsert review task + notificar ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireLeadActionApi({ action: "contract.review.request" });
    if (!auth.ok) return auth.response;

    const parsed = upsertSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    // Verificar oportunidade
    const { data: op } = await supabase
      .from("oportunidades")
      .select("id, solicitante_nome")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const template = await loadDefaultContratoTemplate(supabase);
    if (template) {
      const { data: instance } = await supabase
        .from("document_instances")
        .select("data_json")
        .eq("oportunidade_id", oportunidadeId)
        .eq("template_id", template.id)
        .maybeSingle();
      const stored = readStoredEngine(
        instance?.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
          ? (instance.data_json as Record<string, unknown>)
          : {},
      );
      const missing = stored.build?.data.contractObject?.missingScopeIds ?? [];
      const missingProfiles = stored.build?.data.scopes.filter((s) => s.missingProfile) ?? [];
      if (missing.length > 0 || missingProfiles.length > 0) {
        const label =
          missingProfiles[0]?.label ??
          stored.build?.data.scopes.find((s) => missing.includes(s.entryId))?.label ??
          "sem perfil";
        return NextResponse.json(
          {
            ok: false,
            error: `Não é possível enviar o contrato para revisão. O escopo "${label}" ainda não possui redação contratual configurada.`,
          },
          { status: 422 },
        );
      }
    }

    // O prazo é uma data sem hora: grava a meia-noite de São Paulo (T03:00Z), não T00:00Z,
    // que aparece como o dia anterior para quem está no Brasil.
    const prazoYmd = parsed.data.prazoRevisao ? parseDateOnlyInput(parsed.data.prazoRevisao) : null;
    if (parsed.data.prazoRevisao && !prazoYmd) {
      return NextResponse.json(
        { ok: false, error: "Prazo de revisão inválido. Use dd/mm/aaaa." },
        { status: 400 },
      );
    }
    const prazoIso = prazoYmd ? saoPauloMidnightIso(prazoYmd) : null;

    // Upsert review task
    const { data: task, error: taskErr } = await supabase
      .from("contract_review_tasks")
      .upsert(
        {
          oportunidade_id: oportunidadeId,
          prazo_revisao: prazoIso,
          status: "pendente",
          created_by: auth.profile.id,
          observacao: parsed.data.observacao ?? null,
        },
        { onConflict: "oportunidade_id", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (taskErr) throw taskErr;

    // Notificar usuários da área "Societário e Contratos"
    const { data: recipients } = await supabase
      .from("app_users")
      .select("id, auth_user_id, full_name")
      .in("area", [...CONTRACT_REVIEW_AREA_ALIASES])
      .not("auth_user_id", "is", null);

    const now = new Date().toISOString();
    if (recipients && recipients.length > 0 && prazoIso && prazoYmd) {
      const prazoFormatado = formatDateYmdBr(prazoYmd);
      const solicitanteNome = op.solicitante_nome ?? "";
      const requestedBy = auth.profile?.full_name ?? "Sistema";

      const notifications = recipients.map((u) => ({
        user_id: u.auth_user_id as string,
        tipo: "contract_review_requested",
        payload: {
          // Campos renderizados diretamente pelo sino de notificações
          title: "Revisão de contrato solicitada",
          preview: `${solicitanteNome} · Prazo: ${prazoFormatado} · Por: ${requestedBy}`,
          path: `/crm/leads/${encodeURIComponent(oportunidadeId)}`,
          // Metadados extras
          oportunidade_id: oportunidadeId,
          solicitante_nome: solicitanteNome,
          prazo_revisao: prazoIso,
          review_task_id: task.id,
          requested_by: requestedBy,
        },
      }));

      await supabase.from("crm_in_app_notifications").insert(notifications);

      // Marcar notificação enviada
      await supabase
        .from("contract_review_tasks")
        .update({ notificado_em: now })
        .eq("id", task.id);
    }

    return NextResponse.json({ ok: true, data: task });
  } catch (error) {
    return internalErrorResponse("review-task/post", error, "Falha ao criar tarefa de revisão.");
  }
}

// ─── PATCH: atualizar status / observação ────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireCrmActorApi();
    if (!auth.ok) return auth.response;

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: currentTask, error: currentTaskError } = await supabase
      .from("contract_review_tasks")
      .select("id, status, assigned_to")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (currentTaskError) throw currentTaskError;
    if (!currentTask) {
      return NextResponse.json(
        { ok: false, error: "Nenhuma revisão de contrato foi solicitada para este lead." },
        { status: 404 },
      );
    }

    const decision = evaluateLeadAction(auth.actor, {
      action: "contract.review.update",
      assignedToAppUserId: currentTask.assigned_to ?? null,
    });
    if (!decision.allowed) return forbiddenResponse(decision);

    // Versão gerada que foi revisada: fica gravada na tarefa junto com quem concluiu.
    let reviewedVersionId: string | null = null;
    if (parsed.data.status === "concluido") {
      const reviewedVersion = await findLatestStoredGeneratedDocumentVersion(
        supabase,
        oportunidadeId,
        "contrato",
      );
      reviewedVersionId = reviewedVersion?.id ?? null;
      if (!reviewedVersion) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Gere e armazene uma versão do contrato antes de concluir a revisão.",
            code: "CONTRACT_ARTIFACT_REQUIRED",
          },
          { status: 422 },
        );
      }
    }

    const updateData: {
      status?: string;
      concluido_em?: string;
      approved_by?: string;
      document_version_id?: string | null;
      observacao?: string | null;
    } = {};
    if (parsed.data.status) {
      updateData.status = parsed.data.status;
      if (parsed.data.status === "concluido") {
        updateData.concluido_em = new Date().toISOString();
        updateData.approved_by = auth.profile.id;
        updateData.document_version_id = reviewedVersionId;
      }
    }
    if (parsed.data.observacao !== undefined) {
      updateData.observacao = parsed.data.observacao;
    }

    const { data, error } = await supabase
      .from("contract_review_tasks")
      .update(updateData)
      .eq("oportunidade_id", oportunidadeId)
      .select("*")
      .single();
    if (error) throw error;

    // Ao concluir revisão → avança para Contrato Elaborado (pronto para envio D4Sign)
    let warning: string | undefined;
    if (parsed.data.status === "concluido") {
      const { data: op } = await supabase
        .from("oportunidades")
        .select("id, etapa")
        .eq("id", oportunidadeId)
        .maybeSingle();

      if (op?.etapa === "confeccao_contrato") {
        const nowIso = new Date().toISOString();
        const { data: atomicRow, error: atomicError } = await supabase
          .rpc(
            "transition_opportunity_atomic",
            buildAtomicTransitionRpcArgs({
              opportunityId: oportunidadeId,
              expectedStage: "confeccao_contrato",
              nextStage: "contrato_elaborado",
              changedBy: auth.profile.id,
              update: { updated_at: nowIso },
              leadIntake: null,
              fieldValues: [],
            }),
          )
          .single();

        if (atomicError) {
          // A revisão fica concluída mesmo se a etapa mudou no meio do caminho.
          logServerError("review-task/advance", atomicError, { oportunidadeId });
          warning =
            atomicError.code === "40001"
              ? "Revisão concluída, mas a etapa do lead mudou antes. Atualize a tela."
              : "Revisão concluída, mas não foi possível avançar a etapa. Avance pelo kanban.";
        } else if (atomicRow?.transition_id) {
          await recordLeadActivityEvent(supabase, {
            oportunidadeId,
            kind: "etapa_alterada",
            title: "Etapa alterada",
            detail: "Revisão Societário e Contratos concluída — contrato liberado para envio.",
            etapa: "contrato_elaborado",
            actorAppUserId: auth.profile.id,
            sourceId: `trans:${atomicRow.transition_id}`,
            metadata: {
              from: "confeccao_contrato",
              to: "contrato_elaborado",
              trigger: "contract_review_concluded",
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true, data, ...(warning ? { warning } : {}) });
  } catch (error) {
    return internalErrorResponse("review-task/patch", error, "Falha ao atualizar tarefa de revisão.");
  }
}

// ─── GET: obter tarefa de revisão para o lead ────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("contract_review_tasks")
      .select("*")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (error) {
    return internalErrorResponse("review-task/get", error, "Falha ao buscar tarefa de revisão.");
  }
}
