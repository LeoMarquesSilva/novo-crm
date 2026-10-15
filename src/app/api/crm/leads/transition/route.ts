import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateLeadAction } from "@/lib/auth/crm-access-policy";
import { requireCrmActorApi } from "@/lib/auth/crm-actor";
import { RD_KANBAN_VIEW_ONLY_MESSAGE } from "@/lib/crm/rd-kanban-view";
import { resolvePipelineEtapaFromDbAndRd } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import {
  applyConfeccaoPropostaDefaults,
  collectPriorMeetingValues,
  computeLeadIntakeRequirement,
  dedupeConfeccaoPropostaDefinitionsByNormalizedLabel,
  extractMeetingValuesFromFields,
  filterConfeccaoContratoTransitionDefinitions,
  filterConfeccaoPropostaTransitionDefinitions,
  filterPropostaEnviadaDuplicateLinkFields,
  filterReuniaoDuplicateMeetingFields,
  formatTransitionBlockingError,
  listBlockingCustomFields,
  mapDbFieldToDefinition,
  mergeFieldValuesFromDb,
  mergeMeetingValues,
  valueJsonToFormValue,
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
import { onEnteredInclusaoFaturamento } from "@/lib/crm/post-sale/on-enter-inclusao-faturamento";
import { completeSignedContract } from "@/lib/crm/post-signature/complete-signed-contract";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { buildAtomicTransitionRpcArgs } from "@/lib/crm/atomic-transition";
import { transitionOpportunity } from "@/modules/crm/application/services/transition-opportunity";
import type { OpportunityStage } from "@/modules/crm/domain/entities";
import {
  buildContractTransitionBlocker,
  CONTRACT_BILLING_BLOCKER_MESSAGE,
  type ContractTransitionBlocker,
} from "@/modules/crm/domain/workflow-rules";
import {
  buildDedicatedActionBlocker,
  loadWorkflowEvidenceBlocker,
} from "@/lib/crm/workflow-transition-evidence";

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
  const auth = await requireCrmActorApi();
  if (!auth.ok) return auth.response;

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
      console.error("Falha ao ler a oportunidade na transição", fetchError);
      return NextResponse.json(
        { ok: false, error: "Não foi possível ler a oportunidade." },
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

    const stageDecision = evaluateLeadAction(auth.actor, {
      action: "stage.advance",
      from: currentStage,
      to: nextStage as OpportunityStage,
      lead: {
        createdByAppUserId: (row.criado_por as string | null) ?? null,
        requesterEmail: (row.solicitante_email as string | null) ?? null,
      },
      channel: "manual",
    });
    if (!stageDecision.allowed) {
      if (stageDecision.code === "use_dedicated_action") {
        const blocker = buildDedicatedActionBlocker({
          opportunityId,
          message: stageDecision.reason,
          actionKind: stageDecision.actionKind,
        });
        return NextResponse.json(
          { ok: false, errors: [blocker.message], transitionBlocker: blocker },
          { status: 422 },
        );
      }
      return NextResponse.json({ ok: false, error: stageDecision.reason }, { status: 403 });
    }

    const workflowEvidenceBlocker = await loadWorkflowEvidenceBlocker({
      supabase,
      oportunidadeId: opportunityId,
      currentStage,
      nextStage: nextStage as OpportunityStage,
    });
    if (workflowEvidenceBlocker) {
      return NextResponse.json(
        {
          ok: false,
          errors: [workflowEvidenceBlocker.message],
          transitionBlocker: workflowEvidenceBlocker,
        },
        { status: 422 },
      );
    }

    // Override do admin quando a assinatura já consta na D4Sign mas o lead não avançou
    // (webhook perdido): mesmo caminho da assinatura automática (venda fechada, pós-venda, avisos).
    if (currentStage === "contrato_enviado" && nextStage === "contrato_assinado") {
      const completion = await completeSignedContract({
        supabase,
        opportunityId,
        documentUuid: (row.d4sign_document_uuid as string | null) ?? null,
        signers: row.d4sign_signers ?? null,
        source: "manual",
        actorAppUserId: auth.profile.id,
        leadName: (row.solicitante_nome as string | null) ?? null,
      });
      return NextResponse.json({ ok: true, stage: completion.stage, outcome: completion.outcome });
    }

    const rowProposta = trimOrEmpty(row.link_proposta as string | null | undefined);
    const rowContrato = trimOrEmpty(row.link_contrato as string | null | undefined);
    const inProposta = bodyLink(linkProposta);
    const inContrato = bodyLink(linkContrato);
    const mergedLinkProposta = (inProposta || rowProposta || "") || undefined;
    const mergedLinkContrato = (inContrato || rowContrato || "") || undefined;

    const pipeline = pipelineCodeForStage(nextStage as OpportunityStage);

    let contractBillingSetupComplete = false;
    let contractTransitionBlocker: ContractTransitionBlocker | null = null;
    if (currentStage === "inclusao_faturamento" && nextStage === "boas_vindas") {
      const { data: contract, error: contractError } = await supabase
        .from("contratos")
        .select(
          "id, status, versao_ativa_id, cliente_id, vigente_de, primeiro_vencimento, primeiro_faturamento_condicionado",
        )
        .eq("oportunidade_id", opportunityId)
        .maybeSingle();
      if (contractError) {
        return NextResponse.json({ ok: false, error: contractError.message }, { status: 500 });
      }
      if (!contract) {
        const transitionBlocker = buildContractTransitionBlocker(
          {
            contractId: null,
            isValid: false,
            code: "contract_not_found",
            reason: "Contrato vinculado não encontrado.",
          },
          opportunityId,
        );
        return NextResponse.json(
          {
            ok: false,
            errors: [CONTRACT_BILLING_BLOCKER_MESSAGE],
            transitionBlocker,
          },
          { status: 422 },
        );
      }
      contractTransitionBlocker = buildContractTransitionBlocker(
        {
          contractId: contract.id,
          isValid: false,
          code: "contract_billing_setup_required",
          reason: "Configuração incompleta.",
        },
        opportunityId,
      );

      if (
        contract.status === "ativo" &&
        contract.versao_ativa_id &&
        contract.cliente_id &&
        contract.vigente_de &&
        (contract.primeiro_vencimento || contract.primeiro_faturamento_condicionado)
      ) {
        const [{ data: version }, { count: responsibleCount }, { count: componentCount }] =
          await Promise.all([
            supabase
              .from("contrato_versoes")
              .select("id")
              .eq("id", contract.versao_ativa_id)
              .eq("contrato_id", contract.id)
              .eq("status", "ativa")
              .not("vigente_de", "is", null)
              .maybeSingle(),
            supabase
              .from("contrato_responsaveis")
              .select("id", { count: "exact", head: true })
              .eq("contrato_id", contract.id),
            supabase
              .from("contrato_componentes_cobranca")
              .select("id", { count: "exact", head: true })
              .eq("versao_id", contract.versao_ativa_id),
          ]);
        contractBillingSetupComplete = Boolean(
          version && (responsibleCount ?? 0) > 0 && (componentCount ?? 0) > 0,
        );
      }

      if (!contractBillingSetupComplete) {
        return NextResponse.json(
          { ok: false, errors: [CONTRACT_BILLING_BLOCKER_MESSAGE], transitionBlocker: contractTransitionBlocker },
          { status: 422 },
        );
      }
    }

    let leadIntakeSnapshot:
      | { local_reuniao: string; data_reuniao: string; horario_reuniao: string }
      | null = null;
    if (nextStage === "reuniao" && pipeline === "vendas") {
      const [{ data: intakeRow }, { data: meetingDefs }, { data: priorValueRows }] =
        await Promise.all([
          supabase
            .from("lead_intakes")
            .select("local_reuniao, data_reuniao, horario_reuniao")
            .eq("oportunidade_id", opportunityId)
            .maybeSingle(),
          supabase
            .from("field_definitions")
            .select("id, field_code, label, stage_code")
            .eq("pipeline_code", "vendas")
            .eq("is_active", true),
          supabase
            .from("field_values")
            .select("field_definition_id, value_json")
            .eq("entity_name", "oportunidade")
            .eq("entity_record_id", opportunityId),
        ]);

      const valueByDefId = new Map(
        (priorValueRows ?? []).map((row) => [String(row.field_definition_id), row.value_json]),
      );
      const priorMeetingValues = collectPriorMeetingValues({
        intake: intakeRow
          ? {
              local_reuniao: intakeRow.local_reuniao as string | null,
              data_reuniao: intakeRow.data_reuniao as string | null,
              horario_reuniao: intakeRow.horario_reuniao as string | null,
            }
          : null,
        fields: (meetingDefs ?? []).map((row) => ({
          field_code: String(row.field_code),
          label: String(row.label),
          stage_code: row.stage_code != null ? String(row.stage_code) : null,
          value: valueJsonToFormValue(valueByDefId.get(String(row.id))),
        })),
      });

      const li = computeLeadIntakeRequirement({
        nextStage: nextStage as OpportunityStage,
        intakeRow: intakeRow
          ? {
              local_reuniao: intakeRow.local_reuniao as string | null,
              data_reuniao: intakeRow.data_reuniao as string | null,
              horario_reuniao: intakeRow.horario_reuniao as string | null,
            }
          : null,
        priorMeetingValues,
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

    // Pós-venda usa o cadastro do cliente e a inclusão no faturamento, não campos do modal.
    const { data: defRows, error: defErr } =
      pipeline === "pos_venda"
        ? { data: [] as Database["public"]["Tables"]["field_definitions"]["Row"][], error: null }
        : await supabase
            .from("field_definitions")
            .select("*")
            .eq("pipeline_code", pipeline)
            .eq("stage_code", nextStage)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });

    if (defErr) {
      console.error("Falha ao ler campos da etapa", defErr);
      return NextResponse.json({ ok: false, error: "Não foi possível ler os campos da etapa." }, { status: 500 });
    }

    const defs = filterConfeccaoContratoTransitionDefinitions(
      filterReuniaoDuplicateMeetingFields(
        dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(
          filterPropostaEnviadaDuplicateLinkFields(
            filterConfeccaoPropostaTransitionDefinitions(
              (defRows ?? []).map((r) => mapDbFieldToDefinition(r as Record<string, unknown>)),
              { pipeline, nextStage },
            ),
            { pipeline, nextStage },
          ),
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
        financeiroConcluido: contractBillingSetupComplete,
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

    let atomicLeadIntake: {
      local_reuniao: string;
      data_reuniao: string;
      horario_reuniao: string;
    } | null = null;
    if (nextStage === "reuniao" && pipeline === "vendas" && leadIntake) {
      const hora = leadIntake.horario_reuniao.trim();
      const horaSql = hora.length === 5 && hora.includes(":") ? `${hora}:00` : hora;
      atomicLeadIntake = {
        local_reuniao: leadIntake.local_reuniao.trim(),
        data_reuniao: leadIntake.data_reuniao.trim(),
        horario_reuniao: horaSql,
      };
    } else if (nextStage === "due_diligence_finalizada" && pipeline === "vendas") {
      const extracted = extractMeetingValuesFromFields(
        defs.map((field) => ({
          field_code: field.field_code,
          label: field.label,
          value: mergedFormValues[field.field_code],
        })),
      );
      const { data: intakeForDue } = await supabase
        .from("lead_intakes")
        .select("local_reuniao, data_reuniao, horario_reuniao")
        .eq("oportunidade_id", opportunityId)
        .maybeSingle();
      const mergedMeeting = mergeMeetingValues(
        intakeForDue
          ? {
              local_reuniao: intakeForDue.local_reuniao as string | null,
              data_reuniao: intakeForDue.data_reuniao as string | null,
              horario_reuniao: intakeForDue.horario_reuniao as string | null,
            }
          : null,
        extracted,
      );
      if (mergedMeeting.local_reuniao && mergedMeeting.data_reuniao && mergedMeeting.horario_reuniao) {
        const hora = mergedMeeting.horario_reuniao;
        atomicLeadIntake = {
          local_reuniao: mergedMeeting.local_reuniao,
          data_reuniao: mergedMeeting.data_reuniao,
          horario_reuniao: hora.length === 5 && hora.includes(":") ? `${hora}:00` : hora,
        };
      }
    }

    const atomicFieldValues: Array<{
      id: string | null;
      fieldDefinitionId: string;
      value: string | string[];
    }> = [];
    if (fieldValuesByCode && Object.keys(fieldValuesByCode).length > 0) {
      for (const [code, val] of Object.entries(fieldValuesByCode)) {
        const def = defs.find((d) => d.field_code === code);
        if (!def) continue;
        atomicFieldValues.push({
          id: existingValueIdByDefId.get(def.id) ?? null,
          fieldDefinitionId: def.id,
          value: Array.isArray(val) ? val : String(val),
        });
      }
    }

    const atomicArgs = buildAtomicTransitionRpcArgs({
      opportunityId,
      expectedStage: dbEtapa,
      nextStage,
      changedBy: auth.profile.id,
      update: {
        updated_at: updateRow.updated_at as string,
        ...(Object.hasOwn(updateRow, "link_proposta")
          ? { link_proposta: updateRow.link_proposta ?? null }
          : {}),
        ...(Object.hasOwn(updateRow, "link_contrato")
          ? { link_contrato: updateRow.link_contrato ?? null }
          : {}),
        due_compilacao_entrada_em: updateRow.due_compilacao_entrada_em,
        due_revision_cycle: updateRow.due_revision_cycle,
        due_revisao_entrada_em: updateRow.due_revisao_entrada_em,
      },
      leadIntake: atomicLeadIntake,
      fieldValues: atomicFieldValues,
    });

    const { data: atomicRow, error: atomicError } = await supabase
      .rpc("transition_opportunity_atomic", atomicArgs)
      .single();

    if (atomicError) {
      const conflict =
        atomicError.code === "40001" ||
        atomicError.message.includes("OPPORTUNITY_STAGE_CONFLICT");
      const contractBillingBlocked = atomicError.message.includes(
        "CONTRACT_BILLING_SETUP_REQUIRED",
      );
      console.error("Falha na transição atômica da oportunidade", atomicError);
      return NextResponse.json(
        {
          ok: false,
          error: contractBillingBlocked
            ? CONTRACT_BILLING_BLOCKER_MESSAGE
            : conflict
            ? "A oportunidade foi alterada por outro usuário. Atualize a tela e tente novamente."
            : "Não foi possível concluir a transição.",
          ...(contractBillingBlocked && contractTransitionBlocker
            ? { transitionBlocker: contractTransitionBlocker }
            : {}),
        },
        { status: contractBillingBlocked ? 422 : conflict ? 409 : 500 },
      );
    }

    if (atomicRow?.transition_id) {
      await recordLeadActivityEvent(supabase, {
        oportunidadeId: opportunityId,
        kind: "etapa_alterada",
        title: "Etapa alterada",
        detail: `${currentStage} → ${nextStage}`,
        etapa: nextStage,
        actorAppUserId: auth.profile.id,
        sourceId: `trans:${atomicRow.transition_id}`,
        metadata: { from: currentStage, to: nextStage },
      });
    }

    const originadoPor = actorFromAppUserRow(auth.profile);

    if (nextStage === "aguardando_cadastro" && currentStage === "contrato_assinado") {
      // Lead assinado antes do fluxo automático, movido pelo admin: abre o cadastro e fecha a venda.
      await startPostSaleForLegacyLead(supabase, opportunityId, (row.solicitante_nome as string | null) ?? null);
    }

    if (nextStage === "inclusao_faturamento") {
      await onEnteredInclusaoFaturamento(supabase, {
        opportunityId,
        leadName: (row.solicitante_nome as string | null) ?? null,
      });
    }

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
      linkProposta: atomicRow?.link_proposta?.toString().trim() || null,
      linkContrato: atomicRow?.link_contrato?.toString().trim() || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada na transição.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function startPostSaleForLegacyLead(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  opportunityId: string,
  leadName: string | null,
): Promise<void> {
  try {
    await supabase
      .from("oportunidades")
      .update({ encerramento: "ganho" })
      .eq("id", opportunityId)
      .is("encerramento", null);
    await supabase
      .from("lead_client_onboarding")
      .upsert({ oportunidade_id: opportunityId, status: "rascunho" } as never, {
        onConflict: "oportunidade_id",
        ignoreDuplicates: true,
      });
    await notifyAudience(
      supabase,
      { leadTeamOf: opportunityId },
      {
        tipo: "cadastro_cliente_solicitado",
        title: `Preencha o cadastro do cliente — ${leadName ?? "Lead"}`,
        preview: "Confira os dados de cadastro e de faturamento e envie para Operações Legais.",
        path: `/crm/leads/${encodeURIComponent(opportunityId)}?tab=onboarding`,
        idempotencyKey: `cadastro-solicitado:${opportunityId}`,
        extra: { oportunidade_id: opportunityId },
      },
      { email: false },
    );
  } catch (error) {
    console.warn("[transition] início do pós-venda não completou", error);
  }
}
