import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { PENDING_D4SIGN_STATUSES } from "@/lib/d4sign/enrich-documents";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { mapPendingStatusId } from "@/lib/d4sign/pending-backfill-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export type CancelD4SignDocumentResult =
  | { ok: true; status: string }
  | {
      ok: false;
      reason: "not_pending" | "not_configured" | "quota_exhausted" | "rejected";
      message: string;
      resetAt?: string | null;
    };

/**
 * Cancela um documento em andamento na D4Sign (`POST /documents/{uuid}/cancel`, motivo
 * em `comment`) e atualiza catálogo e oportunidade. Irreversível. Usado pelo botão
 * Cancelar (admin) e pelo reenvio do contrato (substitui o documento pendente).
 */
export async function cancelD4SignDocument(input: {
  uuid: string;
  reason: string;
  canceledBy: string | null;
  source: string;
}): Promise<CancelD4SignDocumentResult> {
  const supabase = createSupabaseAdminClient();
  const { data: doc } = await supabase
    .from("d4sign_documents")
    .select("d4sign_status")
    .eq("uuid_doc", input.uuid)
    .maybeSingle();
  if (!doc?.d4sign_status || !PENDING_D4SIGN_STATUSES.has(doc.d4sign_status)) {
    return { ok: false, reason: "not_pending", message: "Só contratos em andamento podem ser cancelados." };
  }

  const env = getD4SignEnv();
  if (!env.tokenApi) return { ok: false, reason: "not_configured", message: "D4Sign não configurado." };

  const quota = await getD4SignQuotaStatus("documents/cancel");
  if (quota.remaining < 1) {
    return {
      ok: false,
      reason: "quota_exhausted",
      message: "Limite de cancelamentos por hora da D4Sign atingido. Tente de novo mais tarde.",
      resetAt: quota.resetAt,
    };
  }

  let result: Awaited<ReturnType<D4SignConnector["cancelDocument"]>>;
  try {
    result = await D4SignConnector.fromEnv(env).cancelDocument(input.uuid, input.reason, {
      source: input.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[D4Sign] cancelamento falhou", { uuid: input.uuid, message });
    return { ok: false, reason: "rejected", message: "A D4Sign recusou o cancelamento." };
  }

  const nowIso = new Date().toISOString();
  const status = mapPendingStatusId(result.statusId) ?? "6";
  await supabase
    .from("d4sign_documents")
    .update({
      d4sign_status: status,
      status_name: result.statusName ?? "Cancelado",
      status_comment: input.reason,
      who_canceled: (result.whoCanceled ?? input.canceledBy ?? null) as never,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("uuid_doc", input.uuid);
  await supabase
    .from("oportunidades")
    .update({ d4sign_status: status, d4sign_updated_at: nowIso, updated_at: nowIso } as never)
    .eq("d4sign_document_uuid", input.uuid);

  return { ok: true, status };
}
