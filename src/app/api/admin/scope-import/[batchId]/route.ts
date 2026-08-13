import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadScopeImportBatchState } from "@/lib/scope-import/batch-state";
import { SCOPE_IMPORT_BUCKET } from "@/lib/scope-import/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { batchId } = await params;
    const supabase = createSupabaseAdminClient();
    const state = await loadScopeImportBatchState(supabase, batchId);
    if (!state) {
      return NextResponse.json({ ok: false, error: "Lote não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { batchId } = await params;
    const supabase = createSupabaseAdminClient();

    const { data: docs } = await supabase
      .from("scope_import_documents")
      .select("storage_path")
      .eq("batch_id", batchId);

    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(SCOPE_IMPORT_BUCKET).remove(paths);
    }

    const { error } = await supabase.from("scope_import_batches").delete().eq("id", batchId);
    if (error) throw error;

    return NextResponse.json({ ok: true, data: { deleted: batchId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
