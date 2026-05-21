import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";
import { notifyDueReviewResponseToCompilationOwner } from "@/lib/crm/due-area-tasks";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  taskId: z.string().uuid(),
  action: z.enum(["aprovar", "ajustes"]),
  observacaoAjustes: z.string().max(8000).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const { id: opportunityId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.action === "ajustes") {
    const obs = parsed.data.observacaoAjustes?.trim() ?? "";
    if (!obs) {
      return NextResponse.json(
        { ok: false, error: "Informe a observação ao solicitar ajustes." },
        { status: 422 },
      );
    }
  }

  const supabase = createSupabaseAdminClient();
  const { data: task, error: taskError } = await supabase
    .from("due_area_review_tasks")
    .select("id, oportunidade_id, revision_cycle, area_key, responsavel_app_user_id, status, review_started_at")
    .eq("id", parsed.data.taskId)
    .eq("oportunidade_id", opportunityId)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json({ ok: false, error: taskError.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ ok: false, error: "Tarefa de revisão não encontrada." }, { status: 404 });
  }

  const canRespond =
    auth.profile?.role === "admin" ||
    auth.profile?.role === "comercial" ||
    auth.profile?.id === task.responsavel_app_user_id;

  if (!canRespond) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para responder esta revisão." },
      { status: 403 },
    );
  }

  if (task.status !== "pendente") {
    return NextResponse.json(
      { ok: false, error: "Esta revisão já foi respondida." },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();
  const ok = parsed.data.action === "aprovar";
  const reviewStartedAt =
    task.review_started_at && String(task.review_started_at).trim()
      ? String(task.review_started_at)
      : null;
  const reviewElapsedMs =
    reviewStartedAt != null
      ? (() => {
          const diff = Date.parse(now) - Date.parse(reviewStartedAt);
          return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
        })()
      : null;

  const { error: updateError } = await supabase
    .from("due_area_review_tasks")
    .update({
      status: ok ? "ok" : "ajustes_solicitados",
      observacao_ajustes: ok ? null : (parsed.data.observacaoAjustes?.trim() ?? null),
      responded_at: now,
      responded_by_app_user_id: auth.profile?.id ?? null,
      approved_at: ok ? now : null,
      adjustments_requested_at: ok ? null : now,
      review_elapsed_ms: reviewElapsedMs,
      updated_at: now,
    })
    .eq("id", task.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const { data: oppRow } = await supabase
    .from("oportunidades")
    .select("etapa")
    .eq("id", opportunityId)
    .maybeSingle();

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: opportunityId,
    kind: ok ? "due_revisao_aprovada" : "due_ajustes_solicitados",
    title: ok
      ? `DUE — revisão aprovada (${String(task.area_key)})`
      : `DUE — ajustes solicitados (${String(task.area_key)})`,
    detail: ok ? null : (parsed.data.observacaoAjustes?.trim() ?? null),
    areaKey: String(task.area_key ?? ""),
    etapa: (oppRow?.etapa as import("@/modules/crm/domain/entities").OpportunityStage | undefined) ?? null,
    actorAppUserId: auth.profile?.id ?? null,
    sourceId: `due-rev-live:${task.id}:${now}`,
    metadata: { revision_cycle: task.revision_cycle },
  });

  let autoMovedToCompilacao = false;
  let notificationError: string | null = null;
  let whatsappSentAt: string | null = null;

  if (!ok) {
    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("etapa")
      .eq("id", opportunityId)
      .maybeSingle();
    if (opErr) return NextResponse.json({ ok: false, error: opErr.message }, { status: 500 });

    if (op?.etapa === "revisao") {
      const { data: moved, error: moveErr } = await supabase
        .from("oportunidades")
        .update({
          etapa: "compilacao",
          due_compilacao_entrada_em: now,
          updated_at: now,
        })
        .eq("id", opportunityId)
        .eq("etapa", "revisao")
        .select("id")
        .maybeSingle();
      if (moveErr) return NextResponse.json({ ok: false, error: moveErr.message }, { status: 500 });
      if (moved?.id) {
        autoMovedToCompilacao = true;
        const { error: trErr } = await supabase.from("transicoes_etapa").insert({
          oportunidade_id: opportunityId,
          etapa_origem: "revisao",
          etapa_destino: "compilacao",
          alterado_por: auth.profile?.id ?? null,
          observacao: `Automático: ajustes solicitados pela área ${String(task.area_key ?? "N/A")} no ciclo ${task.revision_cycle}.`,
        });
        if (trErr) return NextResponse.json({ ok: false, error: trErr.message }, { status: 500 });

        const { error: markErr } = await supabase
          .from("due_area_review_tasks")
          .update({ compilation_returned_at: now })
          .eq("oportunidade_id", opportunityId)
          .eq("revision_cycle", task.revision_cycle)
          .eq("status", "ajustes_solicitados");
        if (markErr) return NextResponse.json({ ok: false, error: markErr.message }, { status: 500 });
      }
    }
  }

  const originadoPor = actorFromAppUserRow(auth.profile);
  const notifyResult = await notifyDueReviewResponseToCompilationOwner(supabase, {
    oportunidadeId: opportunityId,
    areaKey: String(task.area_key ?? "N/A"),
    revisionCycle: Number(task.revision_cycle),
    status: ok ? "ok" : "ajustes_solicitados",
    observacaoAjustes: ok ? null : (parsed.data.observacaoAjustes?.trim() ?? null),
    respondedByName: auth.profile?.full_name ?? null,
    originadoPor,
  });
  notificationError = notifyResult.error;
  whatsappSentAt = notifyResult.whatsappSent ? now : null;

  const { error: channelAuditErr } = await supabase
    .from("due_area_review_tasks")
    .update({
      whatsapp_enviado_em: whatsappSentAt,
      ultimo_erro_canais: notificationError,
    })
    .eq("id", task.id);
  if (channelAuditErr) {
    return NextResponse.json({ ok: false, error: channelAuditErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, autoMovedToCompilacao });
}
