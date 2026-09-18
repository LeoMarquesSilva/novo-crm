import { NextResponse } from "next/server";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    const { batchId } = await params;
    const supabase = createSupabaseAdminClient();
    const [{ data: batch, error: batchError }, { data: documents, error: docsError }] = await Promise.all([
      supabase.from("contract_import_batches").select("*").eq("id", batchId).maybeSingle(),
      supabase
        .from("contract_import_documents")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true }),
    ]);
    if (batchError) throw batchError;
    if (docsError) throw docsError;
    if (!batch) return NextResponse.json({ ok: false, error: "Lote não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, data: { batch, documents: documents ?? [] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
