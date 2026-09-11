import { convertProposalDocxToPdf, ProposalPdfError } from "@/lib/crm/convert-proposta-pdf";
import { createHash } from "node:crypto";
import { proposalDocxStream } from "@/lib/crm/proposta-docx-stream";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { buildPropostaDocumentSnapshot, loadDefaultDocumentTemplate, loadDocumentTemplateById } from "@/lib/crm/proposta-document-data";
import { proposalDraftRequestSchema, PROPOSAL_DOCX_MIME } from "@/lib/crm/proposta-render-request";
import { readModeloPropostaTemplateBuffer, renderCanonicalProposalDocx } from "@/lib/crm/render-proposta-docx";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Read-only draft: the same DOCX renderer as the official export. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(auth.profile.role))
      return NextResponse.json({ ok: false, error: "Apenas comercial ou admin pode gerar a proposta." }, { status: 403 });
    const parsed = proposalDraftRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const { data: op, error } = await supabase.from("oportunidades").select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    const template = parsed.data.templateId
      ? await loadDocumentTemplateById(supabase, parsed.data.templateId)
      : await loadDefaultDocumentTemplate(supabase);
    if (!template || template.documentType !== "proposta" || !template.isActive)
      return NextResponse.json({ ok: false, error: "Modelo de proposta não encontrado." }, { status: 404 });
    const generatedAt = parsed.data.generatedAt ? new Date(parsed.data.generatedAt) : new Date();
    const snapshot = await buildPropostaDocumentSnapshot({
      supabase, oportunidadeId: id, template, generatedAt,
      draftValues: parsed.data.draftValues, responsavel: parsed.data.responsavel,
    });
    const bytes = renderCanonicalProposalDocx(snapshot.canonical, readModeloPropostaTemplateBuffer(undefined, template.templatePath));
    const isPdf = parsed.data.format === "pdf";
    const output = isPdf ? await convertProposalDocxToPdf(bytes, request.signal) : bytes;
    return new NextResponse(proposalDocxStream(output), { headers: {
      "Content-Type": isPdf ? "application/pdf" : PROPOSAL_DOCX_MIME,
      "Content-Disposition": isPdf ? 'inline; filename="Previa-proposta.pdf"' : 'attachment; filename="Previa-proposta.docx"',
      "Cache-Control": "private, no-store",
      "X-Document-SHA256": createHash("sha256").update(bytes).digest("hex"),
      "X-Document-Pending": String(snapshot.pending.length),
    } });
  } catch (error) {
    if (error instanceof ProposalPdfError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao gerar prévia Word." }, { status: 500 });
  }
}
