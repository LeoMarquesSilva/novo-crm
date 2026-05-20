import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  applyConfeccaoPropostaDefaults,
  buildTransitionWarnings,
  computeLeadIntakeRequirement,
  dedupeConfeccaoPropostaDefinitionsByNormalizedLabel,
  filterConfeccaoPropostaTransitionDefinitions,
  filterPropostaEnviadaDuplicateLinkFields,
  linkFieldsMissing,
  listBlockingCustomFields,
  mapDbFieldToDefinition,
  mergeFieldValuesFromDb,
  type PipelineCode,
} from "@/lib/crm/compute-transition-requirements";
import { allDueReviewTasksApprovedForCycle } from "@/lib/crm/due-area-tasks";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type EmpresaIntakeForModal = {
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};

function parseEmpresasJson(raw: unknown): EmpresaIntakeForModal[] {
  if (!Array.isArray(raw)) return [];
  const out: EmpresaIntakeForModal[] = [];
  raw.forEach((row, i) => {
    if (!row || typeof row !== "object") return;
    const e = row as Record<string, unknown>;
    const rs = typeof e.razao_social === "string" ? e.razao_social.trim() : "";
    const tipo =
      e.tipo_documento === "CPF" || e.tipo_documento === "CNPJ" ? e.tipo_documento : "CNPJ";
    const doc = typeof e.documento === "string" ? e.documento.trim() : "";
    out.push({
      index: i + 1,
      razao_social: rs,
      tipo_documento: tipo,
      documento: doc,
    });
  });
  return out;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isEmptyFormValue(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length < 1;
  return String(value).trim() === "";
}

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

const querySchema = z.object({
  opportunityId: z.string().uuid(),
  nextStage: stageSchema,
  pipeline: z.enum(["vendas", "pos_venda"]),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    opportunityId: sp.get("opportunityId") ?? "",
    nextStage: sp.get("nextStage") ?? "",
    pipeline: sp.get("pipeline") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { opportunityId, nextStage, pipeline } = parsed.data;

  try {
    const supabase = createSupabaseAdminClient();

    const { data: row, error: fetchError } = await supabase
      .from("oportunidades")
      .select("id, link_proposta, link_contrato, havera_due_diligence, due_revision_cycle")
      .eq("id", opportunityId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Oportunidade não encontrada" }, { status: 404 });
    }

    const links = linkFieldsMissing({
      nextStage: nextStage as OpportunityStage,
      linkProposta: row.link_proposta as string | null,
      linkContrato: row.link_contrato as string | null,
    });

    let leadIntake: ReturnType<typeof computeLeadIntakeRequirement>["snapshot"] = null;
    let leadIntakeBlockingReason: string | null = null;

    let empresasIntake: EmpresaIntakeForModal[] = [];

    if (pipeline === "vendas") {
      const { data: intakeRow } = await supabase
        .from("lead_intakes")
        .select("local_reuniao, data_reuniao, horario_reuniao, empresas_json")
        .eq("oportunidade_id", opportunityId)
        .maybeSingle();

      if (nextStage === "confeccao_proposta" && intakeRow) {
        empresasIntake = parseEmpresasJson(intakeRow.empresas_json);
      }

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
      leadIntake = li.snapshot;
      leadIntakeBlockingReason = li.blockingReason;

      if (
        nextStage === "due_diligence_finalizada" &&
        row.havera_due_diligence &&
        leadIntakeBlockingReason == null
      ) {
        const cycle = Number(row.due_revision_cycle) || 0;
        if (cycle < 1) {
          leadIntakeBlockingReason =
            "A negociação precisa ter passado por Revisão antes de finalizar a DUE.";
        } else {
          const allApproved = await allDueReviewTasksApprovedForCycle(
            supabase,
            opportunityId,
            cycle,
          );
          if (!allApproved) {
            leadIntakeBlockingReason =
              "Todas as áreas devem aprovar a revisão da DUE antes de mover para Due Diligence Finalizada.";
          }
        }
      }
    }

    const { data: defRows, error: defError } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("pipeline_code", pipeline as PipelineCode)
      .eq("stage_code", nextStage)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (defError) {
      return NextResponse.json({ ok: false, error: defError.message }, { status: 500 });
    }

    const defs = dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(
      filterPropostaEnviadaDuplicateLinkFields(
        filterConfeccaoPropostaTransitionDefinitions(
          (defRows ?? []).map((r) => mapDbFieldToDefinition(r as Record<string, unknown>)),
          { pipeline: pipeline as PipelineCode, nextStage },
        ),
        { pipeline: pipeline as PipelineCode, nextStage },
      ),
      { pipeline: pipeline as PipelineCode, nextStage },
    );

    const { data: valueRows } = await supabase
      .from("field_values")
      .select("field_definition_id, value_json")
      .eq("entity_name", "oportunidade")
      .eq("entity_record_id", opportunityId);

    let fieldValues = mergeFieldValuesFromDb(defs, valueRows ?? []);
    if (pipeline === "vendas" && nextStage === "reuniao" && leadIntake) {
      const localFromLeadIntake = String(leadIntake.local_reuniao ?? "").trim();
      const dataFromLeadIntake = String(leadIntake.data_reuniao ?? "").trim();
      const horarioFromLeadIntake = String(leadIntake.horario_reuniao ?? "").trim();
      const nextValues = { ...fieldValues };
      for (const def of defs) {
        if (!isEmptyFormValue(nextValues[def.field_code])) continue;
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

        if (isMeetingLocation && localFromLeadIntake) {
          nextValues[def.field_code] = localFromLeadIntake;
          continue;
        }
        if (isMeetingDate && dataFromLeadIntake) {
          nextValues[def.field_code] = dataFromLeadIntake;
          continue;
        }
        if (isMeetingTime && horarioFromLeadIntake) {
          nextValues[def.field_code] = horarioFromLeadIntake;
        }
      }
      fieldValues = nextValues;
    }
    if (pipeline === "vendas" && nextStage === "confeccao_proposta") {
      fieldValues = applyConfeccaoPropostaDefaults(fieldValues, {
        haveraDueDiligence: row.havera_due_diligence as boolean | null | undefined,
      });
    }
    const blockingCustom = listBlockingCustomFields(defs, fieldValues);
    const warnings = buildTransitionWarnings({
      pipeline: pipeline as PipelineCode,
      nextStage,
      fieldValues,
    });

    const needsModal =
      links.linkProposta ||
      links.linkContrato ||
      (leadIntake?.needed === true && leadIntakeBlockingReason === null) ||
      blockingCustom.length > 0;

    return NextResponse.json({
      ok: true,
      needsModal,
      missingLinkProposta: links.linkProposta,
      missingLinkContrato: links.linkContrato,
      leadIntake,
      leadIntakeBlockingReason,
      empresasIntake,
      customFields: defs,
      fieldValues,
      blockingCustomFieldCodes: blockingCustom.map((f) => f.field_code),
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao calcular requisitos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
