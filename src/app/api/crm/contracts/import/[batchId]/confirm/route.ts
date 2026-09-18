import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const confirmSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    const { batchId } = await params;
    const body = confirmSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const { data: docs, error } = await supabase
      .from("contract_import_documents")
      .select("id, storage_bucket, storage_path, original_filename")
      .eq("batch_id", batchId)
      .in("id", body.documentIds);
    if (error) throw error;
    if ((docs ?? []).length !== body.documentIds.length) {
      return NextResponse.json({ ok: false, error: "Documento fora do lote." }, { status: 422 });
    }
    for (const doc of docs ?? []) {
      const { error: downloadError } = await supabase.storage
        .from(doc.storage_bucket)
        .download(doc.storage_path);
      if (downloadError) {
        return NextResponse.json(
          { ok: false, error: `Arquivo não encontrado: ${doc.original_filename}` },
          { status: 422 },
        );
      }
    }
    await supabase
      .from("contract_import_documents")
      .update({ status: "enviado" })
      .eq("batch_id", batchId)
      .in("id", body.documentIds);
    await supabase
      .from("contract_import_batches")
      .update({ status: "extraindo", started_at: new Date().toISOString() })
      .eq("id", batchId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
