import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CONTRACT_IMPORT_BUCKET } from "@/lib/contract-import/constants";
import { validateContractImportFiles } from "@/lib/contract-import/validate-files";
import { sanitizeFilenameForStorage } from "@/lib/scope-import/filename";

const createSchema = z.object({
  files: z.array(
    z.object({
      name: z.string().min(1),
      size: z.number().int().positive(),
      contentType: z.string(),
    }),
  ),
});

async function requireConfigure() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para importar contratos." },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export async function GET() {
  try {
    const auth = await requireConfigure();
    if (!auth.ok) return auth.response;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_import_batches")
      .select("id, status, document_count, processed_count, error_count, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar lotes.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireConfigure();
    if (!auth.ok) return auth.response;
    const body = createSchema.parse(await request.json());
    const validationError = validateContractImportFiles(body.files);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 422 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: batch, error: batchError } = await supabase
      .from("contract_import_batches")
      .insert({
        created_by: auth.profile.id,
        status: "aberto",
        document_count: body.files.length,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;

    const uploads: Array<{ documentId: string; path: string; token: string; bucket: string }> = [];
    for (const file of body.files) {
      const storagePath = `${batch.id}/${randomUUID()}_${sanitizeFilenameForStorage(file.name)}`;
      const { data: doc, error: docError } = await supabase
        .from("contract_import_documents")
        .insert({
          batch_id: batch.id,
          storage_bucket: CONTRACT_IMPORT_BUCKET,
          storage_path: storagePath,
          original_filename: file.name,
          content_type: file.contentType,
          byte_size: file.size,
          status: "aguardando_upload",
          uploaded_by_app_user_id: auth.profile.id,
        })
        .select("id")
        .single();
      if (docError) throw docError;
      const { data: signed, error: signError } = await supabase.storage
        .from(CONTRACT_IMPORT_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (signError || !signed?.token) {
        throw new Error(signError?.message ?? "Falha ao gerar URL de upload.");
      }
      uploads.push({
        documentId: doc.id,
        path: storagePath,
        token: signed.token,
        bucket: CONTRACT_IMPORT_BUCKET,
      });
    }

    return NextResponse.json({ ok: true, data: { batchId: batch.id, uploads } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
