/**
 * POST /api/crm/d4sign/documents/[uuid]/sign-refresh
 *
 * O sócio clicou em Assinar: o contrato entra na frente da fila de
 * signatários (`cursor/partner-sign-refresh`), antes do backlog geral.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { enqueuePartnerSignRefreshIfPending } from "@/lib/d4sign/partner-sign-refresh-queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ ok: false, error: "UUID inválido." }, { status: 400 });
  }

  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const { data: doc, error } = await createSupabaseAdminClient()
    .from("d4sign_documents")
    .select("signers")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: "Não foi possível enfileirar o contrato." }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
  }

  const queued = await enqueuePartnerSignRefreshIfPending(uuid, auth.user.email, doc.signers);
  if (!queued) {
    return NextResponse.json({ ok: false, error: "Só o sócio pendente entra nessa fila." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
