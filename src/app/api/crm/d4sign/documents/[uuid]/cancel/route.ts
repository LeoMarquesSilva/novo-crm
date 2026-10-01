/**
 * POST /api/crm/d4sign/documents/[uuid]/cancel — body `{ reason }`.
 *
 * Cancela o documento na D4Sign (`POST /documents/{uuid}/cancel`, com o
 * motivo como `comment`). Irreversível: só admin, só documento em andamento.
 * Atualiza o catálogo e a oportunidade vinculada; o Webhook 2.0 (tipo 3)
 * ainda chega e notifica admin/comercial.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { PENDING_D4SIGN_STATUSES } from "@/lib/d4sign/enrich-documents";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { mapPendingStatusId } from "@/lib/d4sign/pending-backfill-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Informe o motivo (mínimo 5 caracteres).").max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (auth.profile.role !== "admin") {
    return NextResponse.json({ error: "Só administradores podem cancelar contratos." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Motivo inválido." }, { status: 400 });
  }
  const reason = parsed.data.reason;

  const supabase = createSupabaseAdminClient();
  const { data: doc } = await supabase
    .from("d4sign_documents")
    .select("d4sign_status")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  if (!doc?.d4sign_status || !PENDING_D4SIGN_STATUSES.has(doc.d4sign_status)) {
    return NextResponse.json({ error: "Só contratos em andamento podem ser cancelados." }, { status: 409 });
  }

  const env = getD4SignEnv();
  if (!env.tokenApi) return NextResponse.json({ error: "D4Sign não configurado." }, { status: 503 });
  const quota = await getD4SignQuotaStatus("documents/cancel");
  if (quota.remaining < 1) {
    return NextResponse.json(
      { error: "Limite de cancelamentos por hora da D4Sign atingido. Tente de novo mais tarde." },
      { status: 429 },
    );
  }

  let result: Awaited<ReturnType<D4SignConnector["cancelDocument"]>>;
  try {
    result = await D4SignConnector.fromEnv(env).cancelDocument(uuid, reason, { source: "crm-cancel" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[D4Sign] cancelamento falhou", { uuid, message });
    return NextResponse.json({ error: `A D4Sign recusou o cancelamento: ${message}` }, { status: 502 });
  }

  const nowIso = new Date().toISOString();
  const status = mapPendingStatusId(result.statusId) ?? "6";
  await supabase
    .from("d4sign_documents")
    .update({
      d4sign_status: status,
      status_name: result.statusName ?? "Cancelado",
      status_comment: reason,
      who_canceled: (result.whoCanceled ?? auth.user.email ?? null) as never,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("uuid_doc", uuid);
  await supabase
    .from("oportunidades")
    .update({ d4sign_status: status, d4sign_updated_at: nowIso, updated_at: nowIso } as never)
    .eq("d4sign_document_uuid", uuid);

  return NextResponse.json({ ok: true, status });
}
