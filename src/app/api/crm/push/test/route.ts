import { NextResponse } from "next/server";

import { notificationTag, type CrmPushMessage } from "@/lib/crm/notifications/presentation";
import { sendPushToUser } from "@/lib/crm/push/web-push-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** "Enviar teste" nas preferências: manda um push só para os dispositivos de quem pediu. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const id = crypto.randomUUID();
  const message: CrmPushMessage = {
    id,
    title: "Notificações ativadas",
    body: "É assim que os avisos do CRM vão chegar neste dispositivo.",
    path: "/crm/notifications",
    tag: notificationTag(id),
    tipo: "push_teste",
    group: "outras",
    groupLabel: "Teste",
    timestamp: Date.now(),
  };

  const result = await sendPushToUser(createSupabaseAdminClient(), user.id, message);
  if (!result.configured) {
    return NextResponse.json({ ok: false, error: "Push não configurado no servidor." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result });
}
