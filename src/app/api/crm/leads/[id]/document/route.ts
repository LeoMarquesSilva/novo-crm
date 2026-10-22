import { NextRequest, NextResponse } from "next/server";
import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { enrichGeneratedDocumentVersions } from "@/lib/crm/generated-document-storage";
import {
  buildPropostaDocumentSnapshot,
  loadDefaultDocumentTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { ensureDocumentInstance } from "@/lib/crm/document-instance";

const patchSchema = z.object({
  templateId: z.string().uuid().optional(),
  status: z.string().min(1).max(40).optional(),
  data: z.object({ responsavel: z.string().trim().max(160).optional() }).strict().optional(),
});

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

    const template = await loadDefaultDocumentTemplate(supabase);
    if (!template) return NextResponse.json({ ok: false, error: "Nenhum modelo ativo encontrado." }, { status: 404 });

    const instance = await ensureDocumentInstance({
      supabase,
      oportunidadeId,
      templateId: template.id,
      appUserId: auth.profile?.id ?? null,
    });

    const { data: versions, error: versionsErr } = await supabase
      .from("document_versions")
      .select("id, version_number, generated_file_path, generated_at")
      .eq("instance_id", instance.id)
      .order("version_number", { ascending: false });
    if (versionsErr) throw versionsErr;
    const versionsWithAvailability = await enrichGeneratedDocumentVersions(
      supabase,
      versions ?? [],
    );

    const snapshot = await buildPropostaDocumentSnapshot({
      supabase,
      oportunidadeId,
      template,
      generatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        template,
        instance,
        versions: versionsWithAvailability,
        snapshot,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar documento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireLeadActionApi({ action: "proposal.manage" });
    if (!auth.ok) return auth.response;

    const json = await request.json();
    const parsed = patchSchema.parse(json);
    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const template = parsed.templateId
      ? await loadDocumentTemplateById(supabase, parsed.templateId)
      : await loadDefaultDocumentTemplate(supabase);
    if (!template || template.documentType !== "proposta" || !template.isActive) return NextResponse.json({ ok: false, error: "Modelo de proposta não encontrado." }, { status: 404 });

    const instance = await ensureDocumentInstance({
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
    const message = error instanceof Error ? error.message : "Falha ao salvar documento.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
