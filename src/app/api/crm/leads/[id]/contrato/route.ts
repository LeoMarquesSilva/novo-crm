import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildContratoDocumentSnapshot,
  loadContratoDocumentTemplates,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import { listContratoPendingFields } from "@/lib/crm/contrato-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { applyInheritedContractAreaToggles } from "@/lib/crm/contract-engine/inherit-areas";
import { buildCanonicalContract } from "@/lib/crm/contract-engine/build-canonical";
import { initializeContractFromProposal } from "@/lib/crm/contract-engine/initialize-from-proposal";
import {
  buildClauseLibrary,
  CLAUSE_LIBRARY_SELECT,
  type ClauseLibraryRow,
} from "@/lib/crm/contract-engine/clause-library";
import {
  engineToDataJsonPatch,
  hasStructuredContractObject,
  readObjectDraft,
  readStoredEngine,
} from "@/lib/crm/contract-engine/persist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const patchSchema = z.object({
  templateId: z.string().uuid().optional(),
  status: z.string().min(1).max(40).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  expectedUpdatedAt: z.string().optional(),
});

async function ensureInstance(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  oportunidadeId: string;
  templateId: string;
  appUserId: string | null;
}) {
  const { supabase, oportunidadeId, templateId, appUserId } = params;
  const { data: existing, error: existingErr } = await supabase
    .from("document_instances")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("document_instances")
    .insert({
      oportunidade_id: oportunidadeId,
      template_id: templateId,
      status: "draft",
      current_version: 0,
      data_json: {},
      created_by: appUserId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

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

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const [templates, defaultTemplate] = await Promise.all([
      loadContratoDocumentTemplates(supabase),
      loadDefaultContratoTemplate(supabase),
    ]);

    if (!defaultTemplate) {
      return NextResponse.json({ ok: true, data: { templates, instance: null, versions: [], pending: [], snapshot: null } });
    }

    const { data: clauseRows, error: clauseRowsErr } = await supabase
      .from("contract_clause_templates")
      .select(CLAUSE_LIBRARY_SELECT)
      .eq("is_active", true)
      .order("category")
      .order("sort_order")
      .order("created_at");
    if (clauseRowsErr) throw clauseRowsErr;
    const clausulaRows = (clauseRows ?? []) as ClauseLibraryRow[];
    const clauseLibrary = buildClauseLibrary(clausulaRows);

    let instance = await ensureInstance({
      supabase,
      oportunidadeId,
      templateId: defaultTemplate.id,
      appUserId: auth.profile?.id ?? null,
    });

    const existingEngine = readStoredEngine(
      instance.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
        ? (instance.data_json as Record<string, unknown>)
        : {},
    );
    if (!existingEngine.build || !hasStructuredContractObject(existingEngine.build)) {
      const initialized = await initializeContractFromProposal({
        supabase,
        oportunidadeId,
        createdBy: auth.profile?.id ?? null,
        clauseLibrary,
      });
      instance = initialized.instance as typeof instance;
    }

    const { data: versions, error: versionsErr } = await supabase
      .from("document_versions")
      .select("id, version_number, generated_file_path, generated_at")
      .eq("instance_id", instance.id)
      .order("version_number", { ascending: false });
    if (versionsErr) throw versionsErr;

    const [{ fieldByCode: loadedFields, empresasIntake }, { data: ccDefRows }] = await Promise.all([
      buildContratoDocumentSnapshot({
        supabase,
        oportunidadeId,
        template: defaultTemplate,
        generatedAt: new Date(),
      }),
      supabase
        .from("field_definitions")
        .select("id, field_code, label, field_type, field_options, condition_json, sort_order, is_required")
        .eq("entity_name", "oportunidade")
        .eq("stage_code", "confeccao_contrato")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    const fieldByCode = await applyInheritedContractAreaToggles({
      supabase,
      oportunidadeId,
      fieldByCode: loadedFields,
      updatedBy: auth.profile?.id ?? null,
    });

    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });

    const dataJson = instance.data_json as Record<string, unknown> | null ?? {};
    const storedEngine = readStoredEngine(dataJson);
    const objectDraft = readObjectDraft(dataJson);
    const pending = listContratoPendingFields(
      fieldByCode,
      empresa.razaoSocial ?? "",
      storedEngine.build?.data ?? null,
    );

    const ccFieldDefs = (ccDefRows ?? []).map((d) => ({
      definitionId: String(d.id),
      fieldCode: d.field_code,
      label: d.label,
      fieldType: d.field_type,
      fieldOptions: Array.isArray(d.field_options) ? (d.field_options as string[]) : null,
      conditionJson: d.condition_json ?? null,
      value: String(fieldByCode[d.field_code] ?? ""),
      required: Boolean(d.is_required),
    }));

    // Cláusulas selecionadas + pins de assinatura para este contrato
    const rawSelected = Array.isArray(dataJson.clausulas_selecionadas)
      ? (dataJson.clausulas_selecionadas as Array<{ id: string; title: string; content: string; order: number }>)
      : [];
    const rawPins = Array.isArray(dataJson.pins_signatarios)
      ? (dataJson.pins_signatarios as Array<{
          email: string;
          page: number;
          position_x: number;
          position_y: number;
          page_width: number;
          page_height: number;
          type?: 0 | 1 | 2;
        }>)
      : [];

    // Tarefa de revisão de contrato (se existir)
    const { data: reviewTask } = await supabase
      .from("contract_review_tasks")
      .select("id, prazo_revisao, status, observacao, notificado_em, concluido_em, created_at")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      data: {
        templates,
        template: defaultTemplate,
        instance,
        versions: versions ?? [],
        pending,
        snapshot: {
          fieldByCode,
          empresa: {
            razaoSocial: empresa.razaoSocial,
            documentoFormatado: empresa.documentoFormatado,
          },
        },
        ccFieldDefs,
        availableClauses: clausulaRows,
        clauseLibrary: [...clauseLibrary.values()],
        selectedClauses: rawSelected,
        signaturePins: rawPins,
        reviewTask: reviewTask ?? null,
        engine: storedEngine.build,
        proposalSnapshot: storedEngine.snapshot,
        objectDraft,
        proposalChanged: Boolean(
          storedEngine.snapshot &&
            storedEngine.snapshot.escopoJson !== String(fieldByCode.cp_escopo_detalhe_json ?? ""),
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar contrato.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode salvar documentos." },
        { status: 403 },
      );
    }

    const json = await request.json();
    const parsed = patchSchema.parse(json);
    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const template = parsed.templateId
      ? await loadDocumentTemplateById(supabase, parsed.templateId)
      : await loadDefaultContratoTemplate(supabase);
    if (!template) return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });

    const instance = await ensureInstance({
      supabase,
      oportunidadeId,
      templateId: template.id,
      appUserId: auth.profile.id,
    });

    if (
      parsed.expectedUpdatedAt &&
      instance.updated_at &&
      instance.updated_at !== parsed.expectedUpdatedAt
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "O rascunho do contrato foi alterado por outro usuário.",
          code: "CONTRACT_DRAFT_CHANGED",
        },
        { status: 409 },
      );
    }

    const currentData: Record<string, Json> =
      instance.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
        ? (instance.data_json as Record<string, Json>)
        : {};
    const patchData = (parsed.data ?? {}) as Record<string, Json>;
    const mergedJson = { ...currentData, ...patchData } as Record<string, unknown>;
    const stored = readStoredEngine(mergedJson);
    let nextJson: Record<string, Json> = mergedJson as Record<string, Json>;
    if (stored.snapshot) {
      const draft = readObjectDraft(mergedJson);
      const { data: clauseRows, error: clauseRowsErr } = await supabase
        .from("contract_clause_templates")
        .select(CLAUSE_LIBRARY_SELECT)
        .eq("is_active", true);
      if (clauseRowsErr) throw clauseRowsErr;
      const clauseLibrary = buildClauseLibrary((clauseRows ?? []) as ClauseLibraryRow[]);
      const rebuilt = buildCanonicalContract({
        snapshot: stored.snapshot,
        fieldByCode: Object.fromEntries(
          Object.entries(mergedJson).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ),
        objectFieldValues: draft.objectFieldValues,
        objectOverrides: draft.objectOverrides,
        scopeAdjustment: draft.scopeAdjustment,
        explicitCompositionKey: draft.explicitCompositionKey,
        engineEvents: draft.engineEvents,
        clauseLibrary,
      });
      const rebuiltPatch = engineToDataJsonPatch(rebuilt, stored.snapshot, draft);
      // `rebuiltPatch.clausulas_selecionadas` é um retrato das cláusulas que o
      // MOTOR já gera sozinho — nunca deve virar a "seleção manual" do usuário
      // (campo usado pela barra lateral de Cláusulas Adicionais e como
      // `userExtras` na geração do Word). Antes, quando esse campo ainda não
      // existia, ele "adotava" esse retrato como se fosse escolha manual — daí
      // pra frente a barra lateral mostrava dezenas de cláusulas fantasma como
      // "adicionadas" (nenhuma bate com um id da biblioteca), e se o texto de
      // alguma cláusula do catálogo mudasse depois, a cópia antiga parava de
      // ser reconhecida como redundante e virava duplicata de verdade no
      // contrato gerado. Ver achado real no lead Ingevity, corrigido nesta sessão.
      nextJson = {
        ...mergedJson,
        ...rebuiltPatch,
        clausulas_selecionadas: mergedJson.clausulas_selecionadas ?? [],
      } as unknown as Record<string, Json>;
    }

    const { data, error } = await supabase
      .from("document_instances")
      .update({
        status: parsed.status ?? instance.status ?? "draft",
        data_json: nextJson,
      })
      .eq("id", instance.id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar contrato.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
