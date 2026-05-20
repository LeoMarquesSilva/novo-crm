import { format } from "date-fns";
import type { InvestimentoTipoDef } from "@/data/proposta-investimento-catalog";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import { loadProposalCatalog } from "@/lib/crm/proposal-catalog-db";
import { findInvestmentSubtype, findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";
import { getEscopoEntryForArea } from "@/lib/crm/proposta-escopo-entry";
import { mergeEscopoTemplate, mergeInvestimentoTemplate } from "@/lib/crm/proposta-escopo-preview";
import { parseAreasList, parseEscopoJson } from "@/lib/crm/proposta-escopo-json";
import { buildPropostaDocxTemplateData } from "@/lib/crm/proposta-docx-data";
import { valueJsonToDisplayString } from "@/lib/crm/pipeline-field-values";

export type PropostaDocumentTemplate = {
  id: string;
  name: string;
  documentType: string;
  templatePath: string;
  isActive: boolean;
  version: number;
  metadata: Record<string, unknown>;
  fields: PropostaDocumentTemplateField[];
};

export type PropostaDocumentTemplateField = {
  id: string;
  fieldCode: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  section: string;
  sortOrder: number;
  source: string;
};

export type PropostaDocumentSnapshot = {
  templateData: Record<string, string>;
  fieldByCode: Record<string, string>;
  pending: string[];
  areas: Array<{
    key: string;
    label: string;
    complete: boolean;
    escopo: string;
    investimento: string;
  }>;
};

type DocumentTemplateRow = Database["public"]["Tables"]["document_templates"]["Row"];

export function sanitizeFilenamePart(s: string): string {
  return (
    s
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "lead"
  );
}

export async function loadPipelineFieldByCode(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  oportunidadeId: string,
): Promise<Record<string, string>> {
  const { data: fvRows, error: fvErr } = await supabase
    .from("field_values")
    .select("field_definition_id, value_json")
    .eq("entity_name", "oportunidade")
    .eq("entity_record_id", oportunidadeId);

  if (fvErr) throw fvErr;
  const rows = fvRows ?? [];
  if (rows.length === 0) return {};

  const defIds = [...new Set(rows.map((r) => r.field_definition_id))];
  const { data: defRows, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, field_code")
    .in("id", defIds)
    .eq("entity_name", "oportunidade");

  if (defErr) throw defErr;
  const idToCode = new Map((defRows ?? []).map((d) => [d.id, d.field_code]));
  const out: Record<string, string> = {};
  for (const r of rows) {
    const code = idToCode.get(r.field_definition_id);
    if (code) out[code] = valueJsonToDisplayString(r.value_json);
  }
  return out;
}

export async function loadDefaultDocumentTemplate(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<PropostaDocumentTemplate | null> {
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("document_type", "proposta")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1);

  if (error) throw error;
  const row = templates?.[0];
  if (!row) return null;
  return loadDocumentTemplateById(supabase, String(row.id));
}

export async function loadDocumentTemplates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<PropostaDocumentTemplate[]> {
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("document_type", "proposta")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  const ids = (templates ?? []).map((t) => String(t.id));
  const fieldsByTemplate = await loadTemplateFieldsByTemplateId(supabase, ids);
  return (templates ?? []).map((t) => mapTemplateRow(t, fieldsByTemplate.get(String(t.id)) ?? []));
}

export async function loadDocumentTemplateById(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  templateId: string,
): Promise<PropostaDocumentTemplate | null> {
  const { data: template, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw error;
  if (!template) return null;
  const fieldsByTemplate = await loadTemplateFieldsByTemplateId(supabase, [templateId]);
  return mapTemplateRow(template, fieldsByTemplate.get(templateId) ?? []);
}

async function loadTemplateFieldsByTemplateId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  templateIds: string[],
): Promise<Map<string, PropostaDocumentTemplateField[]>> {
  if (templateIds.length === 0) return new Map();
  const { data: fields, error } = await supabase
    .from("document_template_fields")
    .select("*")
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  const out = new Map<string, PropostaDocumentTemplateField[]>();
  for (const f of fields ?? []) {
    const templateId = String(f.template_id);
    const arr = out.get(templateId) ?? [];
    arr.push({
      id: String(f.id),
      fieldCode: String(f.field_code),
      label: String(f.label),
      fieldType: String(f.field_type),
      isRequired: Boolean(f.is_required),
      section: String(f.section ?? "geral"),
      sortOrder: Number(f.sort_order ?? 0),
      source: String(f.source ?? "crm"),
    });
    out.set(templateId, arr);
  }
  return out;
}

function mapTemplateRow(
  row: DocumentTemplateRow,
  fields: PropostaDocumentTemplateField[],
): PropostaDocumentTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    documentType: String(row.document_type ?? "proposta"),
    templatePath: String(row.template_path ?? "MODELO-PROPOSTA-1.docx"),
    isActive: Boolean(row.is_active),
    version: Number(row.version ?? 1),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    fields,
  };
}

export async function buildPropostaDocumentSnapshot(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  oportunidadeId: string;
  template: PropostaDocumentTemplate;
  generatedAt: Date;
}): Promise<PropostaDocumentSnapshot> {
  const { supabase, oportunidadeId, template, generatedAt } = params;
  const [{ data: intake, error: intakeErr }, fieldByCode, catalog] = await Promise.all([
    supabase.from("lead_intakes").select("*").eq("oportunidade_id", oportunidadeId).maybeSingle(),
    loadPipelineFieldByCode(supabase, oportunidadeId),
    loadProposalCatalog(supabase),
  ]);
  if (intakeErr) throw intakeErr;

  const empresasIntake =
    intake && typeof intake === "object"
      ? parseEmpresasIntakeFromRecord(intake as Record<string, unknown>)
      : [];

  const cpEscopoDetalheJson = fieldByCode.cp_escopo_detalhe_json ?? "";
  const templateData = buildPropostaDocxTemplateData({
    empresasIntake,
    cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    fieldByCode,
    cpEscopoDetalheJson,
    generatedAt,
    scopeCatalog: catalog.scope,
    investmentCatalog: catalog.investment,
  });

  const areas = buildAreaPreview(
    fieldByCode,
    cpEscopoDetalheJson,
    templateData.EMPRESA,
    catalog.scope,
    catalog.investment,
  );
  const pending = listPendingFields({ template, fieldByCode, templateData, areas });

  return { templateData, fieldByCode, pending, areas };
}

function buildAreaPreview(
  fieldByCode: Record<string, string>,
  cpEscopoDetalheJson: string,
  defaultNomeEmpresa: string,
  scopeCatalog: PropostaTiposCatalog,
  investmentCatalog: InvestimentoTipoDef[],
): PropostaDocumentSnapshot["areas"] {
  const escopo = parseEscopoJson(cpEscopoDetalheJson);
  return parseAreasList(fieldByCode.cp_areas_objeto ?? "").map((areaKey) => {
    const areaLabel = normalizePracticeAreaKey(areaKey);
    const entry = getEscopoEntryForArea(escopo, areaKey);
    const sub =
      entry?.tipoId && entry.subtipoId
        ? findScopeSubtype(scopeCatalog, areaLabel, entry.tipoId, entry.subtipoId)
        : undefined;
    const inv = entry?.investimento;
    const invSub =
      inv?.tipoId && inv.subtipoId
        ? findInvestmentSubtype(investmentCatalog, inv.tipoId, inv.subtipoId)
        : undefined;
    const scopeComplete =
      Boolean(sub) &&
      (sub?.placeholderKeys ?? []).every((key) =>
        String(entry?.placeholders?.[key] ?? "").trim(),
      );
    const investmentComplete =
      Boolean(invSub) &&
      (invSub?.placeholderKeys ?? []).every((key) =>
        String(inv?.placeholders?.[key] ?? "").trim(),
      );
    return {
      key: areaKey,
      label: areaLabel,
      complete: scopeComplete && investmentComplete,
      escopo: sub
        ? mergeEscopoTemplate(sub.escopoTemplate, entry?.placeholders ?? {}, { defaultNomeEmpresa }).trim()
        : "",
      investimento: invSub
        ? mergeInvestimentoTemplate(invSub.template, inv?.placeholders ?? {}, { defaultNomeEmpresa }).trim()
        : "",
    };
  });
}

function listPendingFields(params: {
  template: PropostaDocumentTemplate;
  fieldByCode: Record<string, string>;
  templateData: Record<string, string>;
  areas: PropostaDocumentSnapshot["areas"];
}): string[] {
  const pending = new Set<string>();
  for (const f of params.template.fields) {
    if (!f.isRequired) continue;
    if (f.fieldCode === "cp_escopo_detalhe_json") {
      if (params.areas.length === 0 || params.areas.some((a) => !a.complete)) pending.add(f.label);
      continue;
    }
    const value = params.fieldByCode[f.fieldCode] ?? params.templateData[f.fieldCode] ?? "";
    if (!String(value).trim()) pending.add(f.label);
  }

  for (const key of ["EMPRESA", "DOCUMENTO", "ESCOPO_AREA", "INVESTIMENTO"]) {
    if (!String(params.templateData[key] ?? "").trim()) pending.add(`Placeholder [${key}]`);
  }
  return [...pending];
}

export async function loadContratoDocumentTemplates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<PropostaDocumentTemplate[]> {
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("document_type", "contrato")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  const ids = (templates ?? []).map((t) => String(t.id));
  const fieldsByTemplate = await loadTemplateFieldsByTemplateId(supabase, ids);
  return (templates ?? []).map((t) => mapTemplateRow(t, fieldsByTemplate.get(String(t.id)) ?? []));
}

export async function loadDefaultContratoTemplate(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<PropostaDocumentTemplate | null> {
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("*")
    .eq("document_type", "contrato")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1);

  if (error) throw error;
  const row = templates?.[0];
  if (!row) return null;
  return loadDocumentTemplateById(supabase, String(row.id));
}

export async function buildContratoDocumentSnapshot(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  oportunidadeId: string;
  template: PropostaDocumentTemplate;
  generatedAt: Date;
}): Promise<{ fieldByCode: Record<string, string>; empresasIntake: LeadIntakeEmpresaRow[] }> {
  const { supabase, oportunidadeId } = params;
  const [{ data: intake, error: intakeErr }, fieldByCode] = await Promise.all([
    supabase.from("lead_intakes").select("*").eq("oportunidade_id", oportunidadeId).maybeSingle(),
    loadPipelineFieldByCode(supabase, oportunidadeId),
  ]);
  if (intakeErr) throw intakeErr;

  const empresasIntake =
    intake && typeof intake === "object"
      ? parseEmpresasIntakeFromRecord(intake as Record<string, unknown>)
      : [];

  return { fieldByCode, empresasIntake };
}

export function buildGeneratedDocxFilePath(params: {
  oportunidadeId: string;
  versionNumber: number;
  generatedAt: Date;
  baseName: string;
}): string {
  const base = sanitizeFilenamePart(params.baseName);
  return `documentos/propostas/${params.oportunidadeId}/v${params.versionNumber}-${base}-${format(
    params.generatedAt,
    "yyyy-MM-dd-HHmm",
  )}.docx`;
}
