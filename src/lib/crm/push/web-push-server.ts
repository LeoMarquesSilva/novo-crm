import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { WebPushError } from "web-push";

import type { CrmPushMessage } from "@/lib/crm/notifications/presentation";

/**
 * Envio Web Push (VAPID) para os dispositivos inscritos de um usuário (16/11/2026).
 * Chaves: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (vai para o navegador) e `VAPID_PRIVATE_KEY` (só servidor).
 * Gerar com `npx web-push generate-vapid-keys`; as mesmas chaves no `.env` local e na Vercel,
 * porque a inscrição fica presa à chave pública com que foi criada.
 */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  // O "subject" identifica quem envia para o serviço de push: URL do app ou mailto.
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://crm-indol-ten.vercel.app";
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number | null;
};

export type PushSendResult = { sent: number; removed: number; failed: number; configured: boolean };

/** Depois de tantas falhas seguidas (fora 404/410), a inscrição é descartada. */
const MAX_CONSECUTIVE_FAILURES = 8;

export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  message: CrmPushMessage,
): Promise<PushSendResult> {
  const vapid = getVapidConfig();
  if (!vapid) return { sent: 0, removed: 0, failed: 0, configured: false };

  const { data, error } = await admin
    .from("crm_push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", userId);
  if (error) {
    console.warn("[crm-push] inscrições não lidas:", error.message);
    return { sent: 0, removed: 0, failed: 0, configured: true };
  }

  const rows = (data ?? []) as SubscriptionRow[];
  const body = JSON.stringify(message);
  const result: PushSendResult = { sent: 0, removed: 0, failed: 0, configured: true };
  const now = new Date().toISOString();

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          {
            vapidDetails: vapid,
            TTL: 60 * 60 * 24,
            urgency: "high",
          },
        );
        result.sent += 1;
        await admin
          .from("crm_push_subscriptions")
          .update({ last_success_at: now, failure_count: 0, updated_at: now } as never)
          .eq("id", row.id);
      } catch (err) {
        const status = err instanceof WebPushError ? err.statusCode : null;
        const failures = (row.failure_count ?? 0) + 1;
        // 404/410: o navegador cancelou a inscrição (ou o usuário bloqueou). Não volta mais.
        if (status === 404 || status === 410 || failures >= MAX_CONSECUTIVE_FAILURES) {
          result.removed += 1;
          await admin.from("crm_push_subscriptions").delete().eq("id", row.id);
          return;
        }
        result.failed += 1;
        console.warn(
          `[crm-push] envio falhou (${status ?? "rede"}):`,
          err instanceof Error ? err.message : err,
        );
        await admin
          .from("crm_push_subscriptions")
          .update({ failure_count: failures, updated_at: now } as never)
          .eq("id", row.id);
      }
    }),
  );

  return result;
}

/** Não lidas do usuário, para o selo do ícone do app instalado. */
export async function countUnreadNotifications(admin: SupabaseClient, userId: string): Promise<number | undefined> {
  const { count, error } = await admin
    .from("crm_in_app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("lida_em", null);
  if (error) return undefined;
  return count ?? undefined;
}
