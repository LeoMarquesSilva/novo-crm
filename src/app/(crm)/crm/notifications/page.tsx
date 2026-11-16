import { Bell } from "lucide-react";
import { NotificationList, NotificationsHeaderActions } from "./notification-list";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { enrichInAppNotificationsWithDueLevantamento } from "@/lib/crm/in-app-notification-enrich-due-levantamento";
import { enrichInAppNotificationsWithLeadContextoDatas } from "@/lib/crm/in-app-notification-enrich-lead-contexto-datas";
import { enrichInAppNotificationsWithLeadCreator } from "@/lib/crm/in-app-notification-enrich-lead-creator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CrmNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("crm_in_app_notifications")
    .select("id, tipo, payload, lida_em, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rawList = rows ?? [];
  const admin = createSupabaseAdminClient();
  const withLead = await enrichInAppNotificationsWithLeadCreator(admin, rawList);
  const withDue = await enrichInAppNotificationsWithDueLevantamento(admin, withLead);
  const list = await enrichInAppNotificationsWithLeadContextoDatas(admin, withDue);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <CrmPageHeader
        eyebrow="Central de alertas"
        title="Notificações"
        description="Tudo que precisa de você no CRM: escopos por área, DUE, contratos e pós-venda. Configure som e notificações do sistema ao lado."
        icon={Bell}
        actions={<NotificationsHeaderActions />}
      />

      <NotificationList initial={list} />
    </div>
  );
}
