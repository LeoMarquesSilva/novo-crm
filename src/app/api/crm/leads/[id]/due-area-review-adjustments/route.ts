import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";
import {
  markDueReviewTasksReentry,
  notifyDueReviewAreas,
  syncDueAreaReviewTasksForOpportunity,
} from "@/lib/crm/due-area-tasks";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1),
  evidenceKind: z.enum(["link", "file"]),
  completionNote: z.string().max(8000).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!auth.profile || !["admin", "comercial"].includes(auth.profile.role)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para concluir ajustes de revisão." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id: opportunityId } = await params;
  const taskIds = [...new Set(parsed.data.taskIds)];
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("oportunidades")
    .select("id, etapa, due_revision_cycle, link_proposta, updated_at")
    .eq("id", opportunityId)
    .maybeSingle();
  if (opportunityError) {
    return NextResponse.json({ ok: false, error: opportunityError.message }, { status: 500 });
  }
  if (!opportunity) {
    return NextResponse.json({ ok: false, error: "Oportunidade não encontrada." }, { status: 404 });
  }
  if (opportunity.etapa !== "compilacao") {
    return NextResponse.json(
      { ok: false, error: "A conclusão de ajustes só é permitida na etapa de Compilação." },
      { status: 422 },
    );
  }
  const cycle = Number(opportunity.due_revision_cycle) || 0;
  if (cycle < 1) {
    return NextResponse.json(
      { ok: false, error: "Não há ciclo de revisão para concluir ajustes." },
      { status: 422 },
    );
  }

  const { data: rows, error: rowsError } = await supabase
    .from("due_area_review_tasks")
    .select("id, area_key, status, revision_cycle, adjustments_requested_at, responded_at, adjustment_completed_at")
    .eq("oportunidade_id", opportunityId)
    .in("id", taskIds);
  if (rowsError) {
    return NextResponse.json({ ok: false, error: rowsError.message }, { status: 500 });
  }
  if (!rows || rows.length !== taskIds.length) {
    return NextResponse.json(
      { ok: false, error: "Uma ou mais tarefas selecionadas não pertencem a esta oportunidade." },
      { status: 422 },
    );
  }
  if (rows.some((row) => (Number(row.revision_cycle) || 0) !== cycle)) {
    return NextResponse.json(
      { ok: false, error: "As tarefas selecionadas devem pertencer ao ciclo atual de revisão." },
      { status: 422 },
    );
  }
  if (rows.some((row) => row.status !== "ajustes_solicitados")) {
    return NextResponse.json(
      { ok: false, error: "Somente tarefas com ajustes solicitados podem ser concluídas." },
      { status: 422 },
    );
  }

  const minAdjustmentsRequestedAt = rows
    .map((row) => {
      const raw = row.adjustments_requested_at ?? row.responded_at;
      return raw ? Date.parse(String(raw)) : NaN;
    })
    .filter((value) => Number.isFinite(value))
    .reduce<number | null>((acc, value) => (acc == null ? value : Math.min(acc, value)), null);

  if (minAdjustmentsRequestedAt == null) {
    return NextResponse.json(
      { ok: false, error: "As tarefas selecionadas não possuem data de solicitação de ajustes válida." },
      { status: 422 },
    );
  }

  const minIso = new Date(minAdjustmentsRequestedAt).toISOString();
  let evidenceValue: string | null = null;

  if (parsed.data.evidenceKind === "link") {
    const link = String(opportunity.link_proposta ?? "").trim();
    const updatedAtMs = Date.parse(String(opportunity.updated_at ?? ""));
    if (!link) {
      return NextResponse.json(
        { ok: false, error: "Para evidência por link, informe um link atualizado da proposta." },
        { status: 422 },
      );
    }
    if (!Number.isFinite(updatedAtMs) || updatedAtMs <= minAdjustmentsRequestedAt) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O link da proposta ainda não foi atualizado após a solicitação de ajustes desta rodada.",
        },
        { status: 422 },
      );
    }
    evidenceValue = link;
  } else {
    const { data: doc, error: docError } = await supabase
      .from("due_documents")
      .select("id, uploaded_at")
      .eq("oportunidade_id", opportunityId)
      .eq("document_kind", "ppt_compilacao")
      .gte("uploaded_at", minIso)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (docError) {
      return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
    }
    if (!doc?.id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Para evidência por arquivo, envie um novo PPT de compilação após a solicitação de ajustes.",
        },
        { status: 422 },
      );
    }
    evidenceValue = String(doc.id);
  }

  const { error: updateError } = await supabase
    .from("due_area_review_tasks")
    .update({
      adjustment_completed_at: now,
      adjustment_completed_by_app_user_id: auth.profile.id,
      adjustment_completion_note: parsed.data.completionNote?.trim() || null,
      adjustment_evidence_kind: parsed.data.evidenceKind,
      adjustment_evidence_value: evidenceValue,
      updated_at: now,
    })
    .in("id", taskIds)
    .eq("oportunidade_id", opportunityId);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  for (const row of rows) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: opportunityId,
      kind: "due_ajustes_concluidos",
      title: `DUE — ajustes concluídos (${String(row.area_key ?? "área")})`,
      detail: parsed.data.completionNote?.trim() || null,
      areaKey: row.area_key ? String(row.area_key) : null,
      etapa: "compilacao",
      actorAppUserId: auth.profile.id,
      sourceId: `due-adj-done-live:${row.id}:${now}`,
      metadata: { revision_cycle: cycle, evidence_kind: parsed.data.evidenceKind },
    });
  }

  const { count: remainingPendingCount, error: remainingPendingError } = await supabase
    .from("due_area_review_tasks")
    .select("*", { count: "exact", head: true })
    .eq("oportunidade_id", opportunityId)
    .eq("revision_cycle", cycle)
    .eq("status", "ajustes_solicitados")
    .is("adjustment_completed_at", null);
  if (remainingPendingError) {
    return NextResponse.json({ ok: false, error: remainingPendingError.message }, { status: 500 });
  }

  let autoMovedToRevisao = false;
  if ((remainingPendingCount ?? 0) === 0) {
    const nextCycle = cycle + 1;
    const { data: moved, error: moveError } = await supabase
      .from("oportunidades")
      .update({
        etapa: "revisao",
        due_revision_cycle: nextCycle,
        due_revisao_entrada_em: now,
        updated_at: now,
      })
      .eq("id", opportunityId)
      .eq("etapa", "compilacao")
      .select("id")
      .maybeSingle();
    if (moveError) {
      return NextResponse.json({ ok: false, error: moveError.message }, { status: 500 });
    }

    if (moved?.id) {
      const { error: trErr } = await supabase.from("transicoes_etapa").insert({
        oportunidade_id: opportunityId,
        etapa_origem: "compilacao",
        etapa_destino: "revisao",
        alterado_por: auth.profile.id,
        observacao: "Automático: ajustes concluídos na compilação.",
      });
      if (trErr) {
        return NextResponse.json({ ok: false, error: trErr.message }, { status: 500 });
      }

      const { data: adjustedAreasRows, error: adjustedAreasError } = await supabase
        .from("due_area_review_tasks")
        .select("area_key")
        .eq("oportunidade_id", opportunityId)
        .eq("revision_cycle", cycle)
        .eq("status", "ajustes_solicitados");
      if (adjustedAreasError) {
        return NextResponse.json({ ok: false, error: adjustedAreasError.message }, { status: 500 });
      }
      const adjustedAreas = [
        ...new Set((adjustedAreasRows ?? []).map((row) => String(row.area_key)).filter(Boolean)),
      ];

      await markDueReviewTasksReentry(supabase, opportunityId, cycle, now);
      await syncDueAreaReviewTasksForOpportunity(supabase, opportunityId, nextCycle, adjustedAreas);
      await notifyDueReviewAreas(
        supabase,
        opportunityId,
        nextCycle,
        actorFromAppUserRow(auth.profile),
        adjustedAreas,
      );
      autoMovedToRevisao = true;
    }
  }

  return NextResponse.json({ ok: true, autoMovedToRevisao });
}
