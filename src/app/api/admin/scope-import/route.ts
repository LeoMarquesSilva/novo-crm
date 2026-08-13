import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SCOPE_IMPORT_BUCKET } from "@/lib/scope-import/constants";
import { sanitizeFilenameForStorage } from "@/lib/scope-import/filename";
import { validateScopeImportFiles } from "@/lib/scope-import/validate-files";

const createSchema = z.object({
  files: z.array(
    z.object({
      name: z.string().min(1),
      size: z.number().int().positive(),
      contentType: z.string(),
    }),
  ),
});

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("scope_import_batches")
      .select("id, status, document_count, processed_count, error_count, created_at, started_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar lotes.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = createSchema.parse(await request.json());
    const validationError = validateScopeImportFiles(body.files);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 422 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: batch, error: batchError } = await supabase
      .from("scope_import_batches")
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
      const safeName = sanitizeFilenameForStorage(file.name);
      const storagePath = `${batch.id}/${randomUUID()}_${safeName}`;

      const { data: doc, error: docError } = await supabase
        .from("scope_import_documents")
        .insert({
          batch_id: batch.id,
          storage_bucket: SCOPE_IMPORT_BUCKET,
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
        .from(SCOPE_IMPORT_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (signError || !signed?.token) {
        throw new Error(signError?.message ?? "Falha ao gerar URL de upload.");
      }

      uploads.push({
        documentId: doc.id,
        path: storagePath,
        token: signed.token,
        bucket: SCOPE_IMPORT_BUCKET,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          batchId: batch.id,
          uploads,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
