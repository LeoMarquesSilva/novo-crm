import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadScopeImportBatchState, refreshBatchCounters } from "@/lib/scope-import/batch-state";

const confirmSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { batchId } = await params;
    const body = confirmSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: docs, error: docsError } = await supabase
      .from("scope_import_documents")
      .select("id, storage_bucket, storage_path, status, original_filename")
      .eq("batch_id", batchId)
      .in("id", body.documentIds);
    if (docsError) throw docsError;

    if ((docs ?? []).length !== body.documentIds.length) {
      return NextResponse.json(
        { ok: false, error: "Um ou mais documentos não pertencem ao lote." },
        { status: 422 },
      );
    }

    for (const doc of docs ?? []) {
      const { error: downloadError } = await supabase.storage
        .from(doc.storage_bucket)
        .download(doc.storage_path);
      if (downloadError) {
        return NextResponse.json(
          { ok: false, error: `Arquivo não encontrado no storage: ${doc.original_filename ?? doc.id}` },
          { status: 422 },
        );
      }
    }

    const { error: updateError } = await supabase
      .from("scope_import_documents")
      .update({ status: "enviado" })
      .eq("batch_id", batchId)
      .in("id", body.documentIds);
    if (updateError) throw updateError;

    await supabase
      .from("scope_import_batches")
      .update({ status: "extraindo", started_at: new Date().toISOString() })
      .eq("id", batchId);

    await refreshBatchCounters(supabase, batchId);
    const state = await loadScopeImportBatchState(supabase, batchId);

    return NextResponse.json({ ok: true, data: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
