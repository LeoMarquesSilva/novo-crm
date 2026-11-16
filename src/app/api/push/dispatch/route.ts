import { NextResponse } from "next/server";
import { z } from "zod";

import { buildPushMessage } from "@/lib/crm/notifications/presentation";
import { countUnreadNotifications, sendPushToUser } from "@/lib/crm/push/web-push-server";
import { isCronAuthorized } from "@/lib/http/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPayloadLengthAllowed } from "@/lib/webhooks/security";

/**
 * Chamado pelo gatilho `crm_in_app_notifications_push_dispatch` (pg_net) a cada aviso novo.
 * `Authorization: Bearer <CRM_PUSH_DISPATCH_SECRET>` — o mesmo valor guardado no Vault do Supabase.
 */
export const maxDuration = 30;

const MIN_SECRET_LENGTH = 24;
const MAX_BODY_BYTES = 64 * 1024;

const bodySchema = z.object({
  notification: z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    tipo: z.string().min(1).max(120),
    payload: z.unknown(),
    created_at: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  const secret = process.env.CRM_PUSH_DISPATCH_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ ok: false, error: "Push não configurado no servidor." }, { status: 503 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  if (!isPayloadLengthAllowed(request.headers.get("content-length"), MAX_BODY_BYTES)) {
    return NextResponse.json({ ok: false, error: "Corpo grande demais." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Aviso inválido." }, { status: 400 });
  }

  const { notification } = parsed.data;
  const admin = createSupabaseAdminClient();
  const unread = await countUnreadNotifications(admin, notification.user_id);
  const message = buildPushMessage(notification, { unread });
  const result = await sendPushToUser(admin, notification.user_id, message);

  return NextResponse.json({ ok: true, ...result });
}
