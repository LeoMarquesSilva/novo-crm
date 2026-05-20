import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildContratoDocumentSnapshot,
  loadContratoDocumentTemplates,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import { listContratoPendingFields, buildContratoDocxTemplateData } from "@/lib/crm/contrato-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const patchSchema = z.object({
  templateId: z.string().uuid().optional(),
  status: z.string().min(1).max(40).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
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

    const instance = await ensureInstance({
      supabase,
      oportunidadeId,
      templateId: defaultTemplate.id,
      appUserId: auth.profile?.id ?? null,
    });

    const { data: versions, error: versionsErr } = await supabase
      .from("document_versions")
      .select("id, version_number, generated_file_path, generated_at")
      .eq("instance_id", instance.id)
      .order("version_number", { ascending: false });
    if (versionsErr) throw versionsErr;

    const [{ fieldByCode, empresasIntake }, { data: ccDefRows }, { data: clausulaRows }] = await Promise.all([
      buildContratoDocumentSnapshot({
        supabase,
        oportunidadeId,
        template: defaultTemplate,
        generatedAt: new Date(),
      }),
      supabase
        .from("field_definitions")
        .select("id, field_code, label, field_type, field_options, condition_json, sort_order")
        .eq("entity_name", "oportunidade")
        .eq("stage_code", "confeccao_contrato")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("contract_clause_templates")
        .select("id, title, content, category, sort_order")
        .eq("is_active", true)
        .order("category")
        .order("sort_order")
        .order("created_at"),
    ]);

    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });

    const pending = listContratoPendingFields(fieldByCode, empresa.razaoSocial ?? "");

    const ccFieldDefs = (ccDefRows ?? []).map((d) => ({
      definitionId: String(d.id),
      fieldCode: d.field_code,
      label: d.label,
      fieldType: d.field_type,
      fieldOptions: Array.isArray(d.field_options) ? (d.field_options as string[]) : null,
      conditionJson: d.condition_json ?? null,
      value: String(fieldByCode[d.field_code] ?? ""),
    }));

    // Cláusulas selecionadas + pins de assinatura para este contrato
    const dataJson = instance.data_json as Record<string, unknown> | null ?? {};
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
        availableClauses: clausulaRows ?? [],
        selectedClauses: rawSelected,
        signaturePins: rawPins,
        reviewTask: reviewTask ?? null,
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

    const currentData: Record<string, Json> =
      instance.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
        ? (instance.data_json as Record<string, Json>)
        : {};
    const patchData = (parsed.data ?? {}) as Record<string, Json>;

    const { data, error } = await supabase
      .from("document_instances")
      .update({
        status: parsed.status ?? instance.status ?? "draft",
        data_json: { ...currentData, ...patchData },
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
