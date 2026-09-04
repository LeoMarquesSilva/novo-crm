import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildContratoDocumentSnapshot,
  buildGeneratedDocxFilePath,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
  sanitizeFilenamePart,
} from "@/lib/crm/proposta-document-data";
import { formatPropostaFileStamp } from "@/lib/crm/proposta-docx-data";
import {
  buildContratoDocxTemplateData,
  buildContratoDocumentPagePreview,
  listContratoPendingFields,
} from "@/lib/crm/contrato-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { renderContratoDocx } from "@/lib/crm/render-contrato-docx";
import { backupGeneratedDocument } from "@/lib/crm/generated-document-storage";
import { buildCanonicalContratoPage } from "@/lib/crm/contract-engine/legacy-preview";
import { listForbiddenDraftTokens } from "@/lib/crm/contract-engine/placeholders";
import { readStoredEngine } from "@/lib/crm/contract-engine/persist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  templateId: z.string().uuid().optional(),
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode gerar o contrato." },
        { status: 403 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id, solicitante_nome")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const template = parsed.data.templateId
      ? await loadDocumentTemplateById(supabase, parsed.data.templateId)
      : await loadDefaultContratoTemplate(supabase);
    if (!template) return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });

    const generatedAt = new Date();
    const { fieldByCode, empresasIntake } = await buildContratoDocumentSnapshot({
      supabase,
      oportunidadeId,
      template,
      generatedAt,
    });

    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });

    const instance = await ensureInstance({
      supabase,
      oportunidadeId,
      templateId: template.id,
      appUserId: auth.profile.id,
    });
    const storedEngine = readStoredEngine(
      instance.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
        ? (instance.data_json as Record<string, unknown>)
        : {},
    );

    if (storedEngine.build) {
      const blocking = storedEngine.build.alignment.blockers;
      const hardPendencias = storedEngine.build.pendencias.filter(
        (p) =>
          !p.ok &&
          ["parties", "scopes", "profiles", "placeholders", "object_coverage", "object_fields"].includes(
            p.code,
          ),
      );
      const forbidden = listForbiddenDraftTokens(storedEngine.build.data);
      if (blocking.length > 0 || hardPendencias.length > 0 || forbidden.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              blocking[0]?.message ??
              (forbidden.length > 0
                ? `O contrato ainda contém marcações de rascunho (${forbidden.slice(0, 3).join(", ")}).`
                : `Pendências do motor: ${hardPendencias.map((p) => p.label).join(", ")}.`),
            pending: hardPendencias.map((p) => p.label),
          },
          { status: 422 },
        );
      }
    } else {
      const pending = listContratoPendingFields(fieldByCode, empresa.razaoSocial ?? "");
      if (pending.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Preencha os campos pendentes antes de gerar: ${pending.map((p) => p.label).join(", ")}.`,
            pending: pending.map((p) => p.label),
          },
          { status: 422 },
        );
      }
    }

    const templateData = buildContratoDocxTemplateData({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
      fieldByCode,
      generatedAt,
    });

    const nextVersion = Number(instance.current_version ?? 0) + 1;
    const filePath = buildGeneratedDocxFilePath({
      oportunidadeId,
      versionNumber: nextVersion,
      generatedAt,
      baseName: String(op.solicitante_nome ?? "contrato"),
    });

    const dataSnapshot: Json = {
      templateId: template.id,
      templateName: template.name,
      templatePath: template.templatePath,
      fields: fieldByCode as unknown as Json,
      templateData: templateData as unknown as Json,
      canonical: (storedEngine.build?.data ?? null) as unknown as Json,
    };

    const { error: versionErr } = await supabase.from("document_versions").insert({
      instance_id: instance.id,
      version_number: nextVersion,
      data_snapshot: dataSnapshot,
      generated_file_path: filePath,
      generated_by: auth.profile.id,
    });
    if (versionErr) throw versionErr;

    const { error: instanceErr } = await supabase
      .from("document_instances")
      .update({ current_version: nextVersion, status: "generated" })
      .eq("id", instance.id);
    if (instanceErr) throw instanceErr;

    // Gera DOCX programaticamente (sem arquivo de template) para que o Word
    // reflita exatamente os dados preenchidos no builder e no preview ao vivo.
    // Inclui as cláusulas extras escolhidas manualmente no builder — sem isso,
    // o .docx baixado divergia do que o advogado via na tela (cláusulas extras
    // ficavam de fora quando o motor canônico estava ativo).
    const dataJsonForExtras =
      instance.data_json && typeof instance.data_json === "object" && !Array.isArray(instance.data_json)
        ? (instance.data_json as Record<string, unknown>)
        : {};
    const userExtras = Array.isArray(dataJsonForExtras.clausulas_selecionadas)
      ? (dataJsonForExtras.clausulas_selecionadas as Array<{ title: string; content: string }>)
      : [];
    const page = storedEngine.build
      ? buildCanonicalContratoPage({ canonicalData: storedEngine.build.data, userExtras })
      : buildContratoDocumentPagePreview(templateData, userExtras);
    const outBuf = await renderContratoDocx(page);
    const base = sanitizeFilenamePart(String(op.solicitante_nome ?? "contrato"));
    const filename = `Contrato-${base}-v${nextVersion}-${formatPropostaFileStamp(generatedAt)}.docx`;

    await backupGeneratedDocument(
      supabase,
      filePath,
      new Uint8Array(outBuf),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    return new NextResponse(new Uint8Array(outBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Document-Version": String(nextVersion),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar o contrato.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
