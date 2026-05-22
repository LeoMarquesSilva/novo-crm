import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { RD_KANBAN_VIEW_ONLY_MESSAGE } from "@/lib/crm/rd-kanban-view";
import { resolvePipelineEtapaFromDbAndRd } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import {
  applyConfeccaoPropostaDefaults,
  computeLeadIntakeRequirement,
  dedupeConfeccaoPropostaDefinitionsByNormalizedLabel,
  filterConfeccaoPropostaTransitionDefinitions,
  filterPropostaEnviadaDuplicateLinkFields,
  formatTransitionBlockingError,
  listBlockingCustomFields,
  mapDbFieldToDefinition,
  mergeFieldValuesFromDb,
} from "@/lib/crm/compute-transition-requirements";
import { pipelineCodeForStage } from "@/lib/crm/pipeline-board-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { syncPropostaEscopoSolicitacoesForOportunidade } from "@/lib/crm/proposta-escopo-solicitacoes";
import {
  allDueReviewTasksApprovedForCycle,
  countDuePptDocuments,
  markDueReviewTasksReentry,
  notifyDueCompilationOwner,
  notifyDueReviewAreas,
  syncDueAreaReviewTasksForOpportunity,
  syncDueAreaTasksForOpportunity,
} from "@/lib/crm/due-area-tasks";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { transitionOpportunity } from "@/modules/crm/application/services/transition-opportunity";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type OportunidadeUpdate = Database["public"]["Tables"]["oportunidades"]["Update"];

const stageSchema = z.enum([
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
]);

const bodySchema = z.object({
  opportunityId: z.string().uuid(),
  nextStage: stageSchema,
  linkProposta: z.string().optional().nullable(),
  linkContrato: z.string().optional().nullable(),
  leadIntake: z
    .object({
      local_reuniao: z.string().min(1),
      data_reuniao: z.string().min(1),
      horario_reuniao: z.string().min(1),
    })
    .optional(),
  /** Valores digitados no modal por `field_code` (campos configuráveis por etapa). */
  fieldValuesByCode: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
});

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export async function POST(request: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!auth.profile || !["admin", "comercial"].includes(auth.profile.role)) {
    return NextResponse.json(
      { ok: false, error: "Apenas comercial ou admin pode mover oportunidades." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { opportunityId, nextStage, linkProposta, linkContrato, leadIntake, fieldValuesByCode } =
    parsed.data;

  function trimOrEmpty(v: string | null | undefined): string {
    if (v == null) return "";
    return String(v).trim();
  }

  /** Valor enviado no body (trim); string vazia se omitido/null. */
  function bodyLink(v: string | null | undefined): string {
    if (v === undefined || v === null) return "";
    return String(v).trim();
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: row, error: fetchError }, { data: reconRow }] = await Promise.all([
      supabase.from("oportunidades").select("*").eq("id", opportunityId).maybeSingle(),
      supabase
        .from("rd_deal_reconciliacao")
        .select("detalhes")
        .eq("oportunidade_id", opportunityId)
        .order("reconciled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Oportunidade não encontrada" }, { status: 404 });
    }

    if (reconRow?.detalhes) {
      return NextResponse.json(
        { ok: false, error: RD_KANBAN_VIEW_ONLY_MESSAGE },
        { status: 403 },
      );
    }

    const dbEtapa = row.etapa as OpportunityStage;
    const currentStage = resolvePipelineEtapaFromDbAndRd(
      dbEtapa,
      Boolean(reconRow?.detalhes),
      reconRow?.detalhes,
    );
    const rowProposta = trimOrEmpty(row.link_proposta as string | null | undefined);
    const rowContrato = trimOrEmpty(row.link_contrato as string | null | undefined);
    const inProposta = bodyLink(linkProposta);
    const inContrato = bodyLink(linkContrato);
    const mergedLinkProposta = (inProposta || rowProposta || "") || undefined;
    const mergedLinkContrato = (inContrato || rowContrato || "") || undefined;

    const pipeline = pipelineCodeForStage(nextStage as OpportunityStage);

    let leadIntakeSnapshot:
      | { local_reuniao: string; data_reuniao: string; horario_reuniao: string }
      | null = null;
    if (nextStage === "reuniao" && pipeline === "vendas") {
      const { data: intakeRow } = await supabase
        .from("lead_intakes")
        .select("local_reuniao, data_reuniao, horario_reuniao")
        .eq("oportunidade_id", opportunityId)
        .maybeSingle();

      const li = computeLeadIntakeRequirement({
        nextStage: nextStage as OpportunityStage,
        intakeRow: intakeRow
          ? {
              local_reuniao: intakeRow.local_reuniao as string | null,
              data_reuniao: intakeRow.data_reuniao as string | null,
              horario_reuniao: intakeRow.horario_reuniao as string | null,
            }
          : null,
      });
      leadIntakeSnapshot = li.snapshot
        ? {
            local_reuniao: li.snapshot.local_reuniao,
            data_reuniao: li.snapshot.data_reuniao,
            horario_reuniao: li.snapshot.horario_reuniao,
          }
        : null;

      if (li.blockingReason) {
        return NextResponse.json({ ok: false, errors: [li.blockingReason] }, { status: 422 });
      }

      const mergedLocal = leadIntake?.local_reuniao?.trim() ?? li.snapshot?.local_reuniao ?? "";
      const mergedData =
        leadIntake?.data_reuniao?.trim() ?? li.snapshot?.data_reuniao ?? "";
      const mergedHora =
        leadIntake?.horario_reuniao?.trim() ?? li.snapshot?.horario_reuniao ?? "";

      if (!mergedLocal || !mergedData || !mergedHora) {
        return NextResponse.json(
          {
            ok: false,
            errors: [
              "Para mover para Reunião, preencha Local, Data e Horário da reunião (cadastro da oportunidade).",
            ],
          },
          { status: 422 },
        );
      }
    }

    let revisionCycleForNotify: number | null = null;
    const dueRevisionCycle =
      typeof (row as { due_revision_cycle?: unknown }).due_revision_cycle === "number"
        ? (row as { due_revision_cycle: number }).due_revision_cycle
        : Number((row as { due_revision_cycle?: unknown }).due_revision_cycle) || 0;

    if (nextStage === "revisao" && pipeline === "vendas" && row.havera_due_diligence) {
      const pptCount = await countDuePptDocuments(supabase, opportunityId);
      if (pptCount < 1) {
        return NextResponse.json(
          {
            ok: false,
            errors: [
              "Antes de mover para Revisão, envie pelo menos um arquivo PPT da compilação (Due Diligence).",
            ],
          },
          { status: 422 },
        );
      }
      if (dueRevisionCycle >= 1) {
        const { data: pendingAdjustments, error: pendingAdjustmentsError } = await supabase
          .from("due_area_review_tasks")
          .select("id")
          .eq("oportunidade_id", opportunityId)
          .eq("revision_cycle", dueRevisionCycle)
          .eq("status", "ajustes_solicitados")
          .is("adjustment_completed_at", null)
          .limit(1);
        if (pendingAdjustmentsError) {
          return NextResponse.json(
            { ok: false, error: pendingAdjustmentsError.message },
            { status: 500 },
          );
        }
        if ((pendingAdjustments ?? []).length > 0) {
          return NextResponse.json(
            {
              ok: false,
              errors: [
                "Existem ajustes da revisão ainda pendentes neste ciclo. Conclua todas as áreas antes de voltar para Revisão.",
              ],
            },
            { status: 422 },
          );
        }
      }
      revisionCycleForNotify = dueRevisionCycle + 1;
    }

    if (nextStage === "due_diligence_finalizada" && pipeline === "vendas" && row.havera_due_diligence) {
      const cycle = dueRevisionCycle;
      if (cycle < 1) {
        return NextResponse.json(
          {
            ok: false,
            errors: ["A negociação precisa ter passado por Revisão antes de finalizar a DUE."],
          },
          { status: 422 },
        );
      }
      const allApproved = await allDueReviewTasksApprovedForCycle(supabase, opportunityId, cycle);
      if (!allApproved) {
        return NextResponse.json(
          {
            ok: false,
            errors: [
              "Todas as áreas devem aprovar a revisão da DUE antes de mover para Due Diligence Finalizada.",
            ],
          },
          { status: 422 },
        );
      }
    }

    const { data: defRows, error: defErr } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("pipeline_code", pipeline)
      .eq("stage_code", nextStage)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (defErr) {
      return NextResponse.json({ ok: false, error: defErr.message }, { status: 500 });
    }

    const defs = dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(
      filterPropostaEnviadaDuplicateLinkFields(
        filterConfeccaoPropostaTransitionDefinitions(
          (defRows ?? []).map((r) => mapDbFieldToDefinition(r as Record<string, unknown>)),
          { pipeline, nextStage },
        ),
        { pipeline, nextStage },
      ),
      { pipeline, nextStage },
    );

    const { data: valueRows } = await supabase
      .from("field_values")
      .select("id, field_definition_id, value_json")
      .eq("entity_name", "oportunidade")
      .eq("entity_record_id", opportunityId);

    const existingValueIdByDefId = new Map(
      (valueRows ?? []).map((r) => [r.field_definition_id as string, r.id as string]),
    );

    let mergedFormValues = mergeFieldValuesFromDb(defs, valueRows ?? []);
    if (fieldValuesByCode && Object.keys(fieldValuesByCode).length > 0) {
      mergedFormValues = { ...mergedFormValues, ...fieldValuesByCode };
    }
    if (pipeline === "vendas" && nextStage === "confeccao_proposta") {
      mergedFormValues = applyConfeccaoPropostaDefaults(mergedFormValues, {
        haveraDueDiligence: row.havera_due_diligence as boolean | null | undefined,
      });
    }

    if (pipeline === "vendas" && nextStage === "reuniao") {
      const localFromIntake =
        leadIntake?.local_reuniao?.trim() ?? leadIntakeSnapshot?.local_reuniao?.trim() ?? "";
      const dataFromIntake =
        leadIntake?.data_reuniao?.trim() ?? leadIntakeSnapshot?.data_reuniao?.trim() ?? "";
      const horarioFromIntake =
        leadIntake?.horario_reuniao?.trim() ?? leadIntakeSnapshot?.horario_reuniao?.trim() ?? "";

      for (const def of defs) {
        const current = mergedFormValues[def.field_code];
        const hasValue = Array.isArray(current) ? current.length > 0 : String(current ?? "").trim() !== "";
        if (hasValue) continue;

        const codeNorm = normalizeToken(def.field_code);
        const labelNorm = normalizeToken(def.label);
        const isMeetingLocation =
          codeNorm.includes("local_reuniao") ||
          (labelNorm.includes("local") && labelNorm.includes("reuniao"));
        const isMeetingDate =
          codeNorm.includes("data_reuniao") ||
          (labelNorm.includes("data") && labelNorm.includes("reuniao"));
        const isMeetingTime =
          codeNorm.includes("horario_reuniao") ||
          (labelNorm.includes("horario") && labelNorm.includes("reuniao"));

        if (isMeetingLocation && localFromIntake) {
          mergedFormValues[def.field_code] = localFromIntake;
          continue;
        }
        if (isMeetingDate && dataFromIntake) {
          mergedFormValues[def.field_code] = dataFromIntake;
          continue;
        }
        if (isMeetingTime && horarioFromIntake) {
          mergedFormValues[def.field_code] = horarioFromIntake;
        }
      }
    }

    const blockingCustom = listBlockingCustomFields(defs, mergedFormValues);
    if (blockingCustom.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          errors: blockingCustom.map((f) =>
            formatTransitionBlockingError(f, mergedFormValues),
          ),
        },
        { status: 422 },
      );
    }

    const result = transitionOpportunity({
      opportunityId,
      currentStage,
      nextStage,
      hasDueDiligence: Boolean(row.havera_due_diligence),
      changedBy: auth.profile.id,
      payload: {
        linkProposta: mergedLinkProposta,
        linkContrato: mergedLinkContrato,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, errors: result.errors },
        { status: 422 },
      );
    }

    const updateRow: OportunidadeUpdate = {
      etapa: nextStage,
      updated_at: new Date().toISOString(),
    };
    if (mergedLinkProposta !== undefined) {
      updateRow.link_proposta = mergedLinkProposta;
    }
    if (mergedLinkContrato !== undefined) {
      updateRow.link_contrato = mergedLinkContrato;
    }

    if (
      nextStage === "compilacao" &&
      pipeline === "vendas" &&
      row.havera_due_diligence &&
      !(row as { due_compilacao_entrada_em?: string | null }).due_compilacao_entrada_em
    ) {
      updateRow.due_compilacao_entrada_em = new Date().toISOString();
    }

    if (
      nextStage === "revisao" &&
      pipeline === "vendas" &&
      row.havera_due_diligence &&
      revisionCycleForNotify != null
    ) {
      updateRow.due_revision_cycle = revisionCycleForNotify;
      updateRow.due_revisao_entrada_em = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("oportunidades")
      .update(updateRow)
      .eq("id", opportunityId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 },
      );
    }

    if (nextStage === "reuniao" && pipeline === "vendas" && leadIntake) {
      const hora = leadIntake.horario_reuniao.trim();
      const horaSql = hora.length === 5 && hora.includes(":") ? `${hora}:00` : hora;
      const { error: intakeUpdErr } = await supabase
        .from("lead_intakes")
        .update({
          local_reuniao: leadIntake.local_reuniao.trim(),
          data_reuniao: leadIntake.data_reuniao.trim(),
          horario_reuniao: horaSql,
        })
        .eq("oportunidade_id", opportunityId);
      if (intakeUpdErr) {
        return NextResponse.json(
          { ok: false, error: `Falha ao salvar dados da reunião: ${intakeUpdErr.message}` },
          { status: 500 },
        );
      }
    }

    if (fieldValuesByCode && Object.keys(fieldValuesByCode).length > 0) {
      const now = new Date().toISOString();
      for (const [code, val] of Object.entries(fieldValuesByCode)) {
        const def = defs.find((d) => d.field_code === code);
        if (!def) continue;
        const valueJson = Array.isArray(val) ? val : String(val);
        const existingId = existingValueIdByDefId.get(def.id);

        if (existingId) {
          const { error: fvErr } = await supabase
            .from("field_values")
            .update({ value_json: valueJson, updated_at: now })
            .eq("id", existingId);
          if (fvErr) {
            return NextResponse.json(
              { ok: false, error: `Falha ao gravar campo ${code}: ${fvErr.message}` },
              { status: 500 },
            );
          }
        } else {
          const { error: insErr } = await supabase.from("field_values").insert({
            entity_name: "oportunidade",
            entity_record_id: opportunityId,
            field_definition_id: def.id,
            value_json: valueJson,
          });
          if (insErr) {
            return NextResponse.json(
              { ok: false, error: `Falha ao salvar campo ${code}: ${insErr.message}` },
              { status: 500 },
            );
          }
        }
      }
    }

    const { data: updatedRow, error: readBackError } = await supabase
      .from("oportunidades")
      .select("link_proposta, link_contrato")
      .eq("id", opportunityId)
      .single();

    if (readBackError) {
      return NextResponse.json(
        { ok: false, error: readBackError.message },
        { status: 500 },
      );
    }

    const { data: transRow, error: auditError } = await supabase
      .from("transicoes_etapa")
      .insert({
        oportunidade_id: opportunityId,
        etapa_origem: currentStage,
        etapa_destino: nextStage,
        alterado_por: auth.profile.id,
        observacao: null,
      })
      .select("id")
      .single();

    if (auditError) {
      const { error: revertError } = await supabase
        .from("oportunidades")
        .update({
          etapa: dbEtapa,
          updated_at: row.updated_at,
          link_proposta: row.link_proposta,
          link_contrato: row.link_contrato,
        })
        .eq("id", opportunityId);

      return NextResponse.json(
        {
          ok: false,
          error: auditError.message,
          reverted: !revertError,
          revertError: revertError?.message,
        },
        { status: 500 },
      );
    }

    if (transRow?.id) {
      await recordLeadActivityEvent(supabase, {
        oportunidadeId: opportunityId,
        kind: "etapa_alterada",
        title: "Etapa alterada",
        detail: `${currentStage} → ${nextStage}`,
        etapa: nextStage,
        actorAppUserId: auth.profile.id,
        sourceId: `trans:${transRow.id}`,
        metadata: { from: currentStage, to: nextStage },
      });
    }

    const originadoPor = actorFromAppUserRow(auth.profile);

    if (nextStage === "confeccao_proposta" && pipeline === "vendas") {
      const raw = mergedFormValues["cp_areas_objeto"];
      const areasStr = Array.isArray(raw)
        ? raw.map(String).filter(Boolean).join(", ")
        : String(raw ?? "").trim();
      if (areasStr) {
        try {
          await syncPropostaEscopoSolicitacoesForOportunidade(supabase, opportunityId, areasStr, {
            originado_por: originadoPor,
          });
        } catch (e) {
          console.error("syncPropostaEscopoSolicitacoesForOportunidade", e);
        }
      }
    }

    if (nextStage === "levantamento_dados" && pipeline === "vendas" && row.havera_due_diligence) {
      await syncDueAreaTasksForOpportunity(supabase, opportunityId, { originado_por: originadoPor });
    }

    if (nextStage === "compilacao" && pipeline === "vendas" && row.havera_due_diligence) {
      await notifyDueCompilationOwner(supabase, opportunityId, originadoPor);
    }

    if (
      nextStage === "revisao" &&
      pipeline === "vendas" &&
      row.havera_due_diligence &&
      revisionCycleForNotify != null
    ) {
      const previousCycle = revisionCycleForNotify - 1;
      await markDueReviewTasksReentry(supabase, opportunityId, previousCycle, new Date().toISOString());
      await syncDueAreaReviewTasksForOpportunity(supabase, opportunityId, revisionCycleForNotify);
      await notifyDueReviewAreas(supabase, opportunityId, revisionCycleForNotify, originadoPor);
    }

    return NextResponse.json({
      ok: true,
      etapa: nextStage,
      linkProposta: updatedRow?.link_proposta?.toString().trim() || null,
      linkContrato: updatedRow?.link_contrato?.toString().trim() || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada na transição.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
