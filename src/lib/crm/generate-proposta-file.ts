import { convertProposalDocxToPdf, resolveProposalPdfProvider, ProposalPdfError } from "./convert-proposta-pdf";
import { createHash } from "node:crypto";
import { formatPropostaFileStamp } from "./proposta-docx-data";
import { PROPOSAL_DOCX_MIME } from "./proposta-render-request";
import {
  buildGeneratedDocxFilePath,
  buildPropostaDocumentSnapshot,
  loadDefaultDocumentTemplate,
  loadDocumentTemplateById,
  sanitizeFilenamePart,
} from "@/lib/crm/proposta-document-data";
import { readModeloPropostaTemplateBuffer, renderCanonicalProposalDocx } from "@/lib/crm/render-proposta-docx";
import { backupGeneratedDocument } from "@/lib/crm/generated-document-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type PropostaExportFormat = "docx" | "pdf";

export type GeneratePropostaFileResult =
  | {
      ok: true;
      bytes: Uint8Array;
      filename: string;
      contentType: string;
      version: number;
      sha256: string;
      sourceDocxSha256: string;
    }
  | { ok: false; error: string; status: number; pending?: string[] };

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

export async function generatePropostaFile(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  oportunidadeId: string;
  templateId?: string;
  appUserId: string | null;
  format: PropostaExportFormat;
  generatedAt?: Date;
  signal?: AbortSignal;
}): Promise<GeneratePropostaFileResult> {
  const { supabase, oportunidadeId, appUserId, format } = params;
  if (format === "pdf") {
    try { resolveProposalPdfProvider(); } catch (error) {
      if (error instanceof ProposalPdfError) return { ok: false, error: error.message, status: error.status };
      throw error;
    }
  }

  const { data: op, error: opErr } = await supabase
    .from("oportunidades")
    .select("id, solicitante_nome")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opErr) throw opErr;
  if (!op) return { ok: false, error: "Negociação não encontrada.", status: 404 };

  const template = params.templateId
    ? await loadDocumentTemplateById(supabase, params.templateId)
    : await loadDefaultDocumentTemplate(supabase);
  if (!template || template.documentType !== "proposta" || !template.isActive) return { ok: false, error: "Modelo não encontrado.", status: 404 };

  const generatedAt = params.generatedAt ?? new Date();
  const snapshot = await buildPropostaDocumentSnapshot({
    supabase,
    oportunidadeId,
    template,
    generatedAt,
  });

  if (snapshot.pending.length > 0) {
    return {
      ok: false,
      error: `Preencha os campos pendentes antes de gerar: ${snapshot.pending.join(", ")}.`,
      status: 422,
      pending: snapshot.pending,
    };
  }

  // Render and validate before any version metadata is written.
  const templateBuf = readModeloPropostaTemplateBuffer(undefined, template.templatePath);
  const docxBytes = renderCanonicalProposalDocx(snapshot.canonical, templateBuf);
  const bytes = format === "pdf" ? await convertProposalDocxToPdf(docxBytes, params.signal) : docxBytes;
  params.signal?.throwIfAborted();
  const sourceDocxSha256 = createHash("sha256").update(docxBytes).digest("hex");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const instance = await ensureInstance({
    supabase,
    oportunidadeId,
    templateId: template.id,
    appUserId,
  });
  const nextVersion = Number(instance.current_version ?? 0) + 1;
  const filePath = buildGeneratedDocxFilePath({
    oportunidadeId, versionNumber: nextVersion, generatedAt,
    baseName: String(op.solicitante_nome ?? "proposta"),
    fileStamp: formatPropostaFileStamp(generatedAt),
  }).replace(/\.docx$/, `.${format}`);

  const dataSnapshot: Json = {
    templateId: template.id,
    templateName: template.name,
    templatePath: template.templatePath,
    format,
    fields: snapshot.fieldByCode,
    templateData: snapshot.templateData,
    areas: snapshot.areas,
    canonical: JSON.parse(JSON.stringify(snapshot.canonical)) as Json,
    generatedAt: generatedAt.toISOString(),
    sha256,
    sourceDocxSha256,
    templateSha256: createHash("sha256").update(templateBuf).digest("hex"),
  };

  const { error: versionErr } = await supabase.from("document_versions").insert({
    instance_id: instance.id,
    version_number: nextVersion,
    data_snapshot: dataSnapshot,
    generated_file_path: filePath,
    generated_by: appUserId,
  });
  if (versionErr) throw versionErr;

  await backupGeneratedDocument(
    supabase,
    filePath,
    bytes,
    format === "pdf" ? "application/pdf" : PROPOSAL_DOCX_MIME,
  );

  const { error: instanceErr } = await supabase
    .from("document_instances")
    .update({ current_version: nextVersion, status: "generated" })
    .eq("id", instance.id);
  if (instanceErr) throw instanceErr;

  const base = sanitizeFilenamePart(String(op.solicitante_nome ?? "proposta"));
  const stamp = formatPropostaFileStamp(generatedAt);
  return {
    ok: true, bytes,
    filename: `Proposta-${base}-v${nextVersion}-${stamp}.${format}`,
    contentType: format === "pdf" ? "application/pdf" : PROPOSAL_DOCX_MIME,
    version: nextVersion, sha256, sourceDocxSha256,
  };
}
