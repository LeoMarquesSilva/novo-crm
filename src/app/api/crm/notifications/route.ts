import { NextResponse } from "next/server";
import { enrichInAppNotificationsWithDueLevantamento } from "@/lib/crm/in-app-notification-enrich-due-levantamento";
import { enrichInAppNotificationsWithLeadContextoDatas } from "@/lib/crm/in-app-notification-enrich-lead-contexto-datas";
import { enrichInAppNotificationsWithLeadCreator } from "@/lib/crm/in-app-notification-enrich-lead-creator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("crm_in_app_notifications")
    .select("id, tipo, payload, lida_em, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const withLead = await enrichInAppNotificationsWithLeadCreator(admin, rows ?? []);
  const withDue = await enrichInAppNotificationsWithDueLevantamento(admin, withLead);
  const list = await enrichInAppNotificationsWithLeadContextoDatas(admin, withDue);
  const unreadCount = list.filter((r) => r.lida_em == null).length;

  return NextResponse.json({
    ok: true,
    notifications: list,
    unreadCount,
  });
}
