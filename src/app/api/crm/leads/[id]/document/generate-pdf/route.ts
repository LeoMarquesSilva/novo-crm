import { ProposalPdfError } from "@/lib/crm/convert-proposta-pdf";
import { NextRequest, NextResponse } from "next/server";
import { proposalDocxStream } from "@/lib/crm/proposta-docx-stream";
import { proposalRenderRequestSchema } from "@/lib/crm/proposta-render-request";
import { requireAuthApi } from "@/lib/auth/server";
import { generatePropostaFile } from "@/lib/crm/generate-proposta-file";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
const bodySchema = proposalRenderRequestSchema;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode gerar a proposta." },
        { status: 403 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const { id: rawId } = await params;
    const result = await generatePropostaFile({
      supabase: createSupabaseAdminClient(),
      oportunidadeId: decodeURIComponent(rawId),
      templateId: parsed.data.templateId,
      appUserId: auth.profile.id,
      format: "pdf",
      signal: request.signal,
      generatedAt: parsed.data.generatedAt ? new Date(parsed.data.generatedAt) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, pending: result.pending },
        { status: result.status },
      );
    }

    return new NextResponse(proposalDocxStream(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "Cache-Control": "no-store",
        "X-Document-Version": String(result.version),
        "X-Document-SHA256": result.sha256,
        "X-Source-DOCX-SHA256": result.sourceDocxSha256,
      },
    });
  } catch (error) {
    if (error instanceof ProposalPdfError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Falha ao gerar o documento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
