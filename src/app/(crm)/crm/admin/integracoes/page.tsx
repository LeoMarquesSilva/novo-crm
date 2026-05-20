import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { IntegracoesAdminTabs } from "@/components/crm/integracoes-admin-tabs";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  type WhatsappDueConfig,
  type WhatsappDueUseCase,
} from "@/components/crm/whatsapp-due-config-panel";

type WhatsappDestinationType = WhatsappDueConfig["destination_type"];

function normalizeDestinationType(value: string): WhatsappDestinationType {
  return value === "number" || value === "group" ? value : "group";
}

function normalizeUseCase(value: string): WhatsappDueUseCase {
  const valid: WhatsappDueUseCase[] = [
    "due_diligence",
    "lead_notification",
    "pipeline_alert",
    "general",
  ];
  return valid.includes(value as WhatsappDueUseCase) ? (value as WhatsappDueUseCase) : "due_diligence";
}

function loadConfigErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return "Erro ao carregar configurações";
}

async function getWhatsappConfig() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_due_config")
      .select("id, label, destination, destination_type, is_active, notes, use_case")
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("label", { ascending: true });

    if (error) throw error;
    const items: WhatsappDueConfig[] = (data ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      destination: item.destination,
      destination_type: normalizeDestinationType(item.destination_type),
      is_active: item.is_active,
      notes: item.notes,
      use_case: normalizeUseCase(item.use_case ?? "due_diligence"),
    }));

    return {
      data: items.find((item) => item.is_active) ?? items[0] ?? null,
      items,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      items: [],
      error: loadConfigErrorMessage(err),
    };
  }
}

const INTEGRACOES_TABS = ["rd", "sharepoint", "email", "whatsapp"] as const;

function normalizeIntegracoesTab(tab: string | undefined): (typeof INTEGRACOES_TABS)[number] {
  if (tab && (INTEGRACOES_TABS as readonly string[]).includes(tab)) {
    return tab as (typeof INTEGRACOES_TABS)[number];
  }
  return "rd";
}

export default async function IntegracoesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; email_oauth?: string; message?: string }>;
}) {
  await requireAdmin("/crm/admin/integracoes");

  const sp = await searchParams;
  const initialTab = normalizeIntegracoesTab(sp.tab);

  const { data, items, error } = await getWhatsappConfig();

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Integrações"
        description="Configure integrações administrativas do CRM, sincronizações externas e destinos de notificação."
        icon={MessageCircle}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar configuração</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando integrações…</p>}>
        <IntegracoesAdminTabs
          whatsappInitialConfig={data}
          whatsappInitialConfigs={items}
          initialTab={initialTab}
        />
      </Suspense>
    </div>
  );
}
