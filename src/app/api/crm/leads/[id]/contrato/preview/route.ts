import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildContratoDocumentSnapshot,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import {
  buildContratoDocxTemplateData,
  buildContratoDocumentPagePreview,
} from "@/lib/crm/contrato-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  templateId: z.string().uuid().optional(),
  /** Valores de rascunho (ainda não salvos no DB) para sobrescrever o snapshot. */
  draftValues: z.record(z.string(), z.string()).optional(),
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
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const template = parsed.data.templateId
      ? await loadDocumentTemplateById(supabase, parsed.data.templateId)
      : await loadDefaultContratoTemplate(supabase);
    if (!template) return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });

    const { fieldByCode: dbFieldByCode, empresasIntake } = await buildContratoDocumentSnapshot({
      supabase,
      oportunidadeId,
      template,
      generatedAt: new Date(),
    });

    // Merge draft overrides on top of DB values (for live preview before saving)
    const fieldByCode = parsed.data.draftValues
      ? { ...dbFieldByCode, ...parsed.data.draftValues }
      : dbFieldByCode;

    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });

    const templateData = buildContratoDocxTemplateData({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
      fieldByCode,
      generatedAt: new Date(),
    });

    const page = buildContratoDocumentPagePreview(templateData);

    return NextResponse.json({
      ok: true,
      data: {
        page,
        empresa: empresa.razaoSocial ?? "",
        templateName: template.name,
        generatedAt: new Date().toISOString(),
        previewFormat: "document_page" as const,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar preview.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
