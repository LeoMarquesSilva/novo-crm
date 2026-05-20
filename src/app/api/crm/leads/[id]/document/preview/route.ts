import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildPropostaDocumentSnapshot,
  loadDefaultDocumentTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import { buildPropostaDocumentPagePreview } from "@/lib/crm/proposta-docx-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  templateId: z.string().uuid().optional(),
  /** Valores de rascunho (ainda não salvos no DB) para sobrescrever o snapshot. */
  draftValues: z.record(z.string(), z.string()).optional(),
  /**
   * Quando `true`, retorna o preview mesmo se houver pendências.
   * Permite live preview parcial (campos vazios viram "…").
   */
  allowPending: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const template = parsed.data.templateId
      ? await loadDocumentTemplateById(supabase, parsed.data.templateId)
      : await loadDefaultDocumentTemplate(supabase);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });
    }

    const snapshot = await buildPropostaDocumentSnapshot({
      supabase,
      oportunidadeId,
      template,
      generatedAt: new Date(),
    });

    // Bloqueio histórico (chamadas legadas sem `allowPending`)
    if (!parsed.data.allowPending && snapshot.pending.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Há pendências antes do preview.",
          pending: snapshot.pending,
        },
        { status: 422 },
      );
    }

    // Aplica overrides do draft (live preview antes de salvar) — só sobrescreve
    // chaves do `templateData` que vêm direto do fieldByCode equivalente.
    // Para chaves complexas (EMPRESA, ESCOPO_AREA, INVESTIMENTO etc.) que dependem
    // de catálogo, o client roda `buildPropostaDocumentPagePreview` por cima.
    const mergedTemplateData = parsed.data.draftValues
      ? { ...snapshot.templateData, ...parsed.data.draftValues }
      : snapshot.templateData;

    const page = buildPropostaDocumentPagePreview(mergedTemplateData);

    return NextResponse.json({
      ok: true,
      data: {
        page,
        templateName: template.name,
        generatedAt: new Date().toISOString(),
        previewFormat: "document_page" as const,
        pending: snapshot.pending,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar preview.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
