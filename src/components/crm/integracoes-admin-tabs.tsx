"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Cloud,
  Mail,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { RdSyncAdminPanel } from "@/components/crm/rd-sync-admin-panel";
import { SharePointConfigPanel } from "@/components/crm/sharepoint-config-panel";
import { LeadEmailConfigPanel } from "@/components/crm/lead-email-config-panel";
import {
  WhatsappDueConfigPanel,
  type WhatsappDueConfig,
} from "@/components/crm/whatsapp-due-config-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = ["rd", "sharepoint", "email", "whatsapp"] as const;
type TabValue = (typeof TAB_VALUES)[number];

type OauthBanner = {
  variant: "default" | "destructive";
  title: string;
  description: string;
};

type IntegracoesAdminTabsProps = {
  whatsappInitialConfig: WhatsappDueConfig | null;
  whatsappInitialConfigs: WhatsappDueConfig[];
  initialTab: TabValue;
};

export function IntegracoesAdminTabs({
  whatsappInitialConfig,
  whatsappInitialConfigs,
  initialTab,
}: IntegracoesAdminTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabValue>(initialTab);
  const [oauthBanner] = useState<OauthBanner | null>(() => {
    const outcome = searchParams.get("email_oauth");
    if (!outcome) return null;
    if (outcome === "success") {
      return {
        variant: "default",
        title: "Outlook ligado",
        description:
          "A conta Microsoft foi associada (OAuth delegado, como no n8n). Os e-mails de novos leads passam a ser enviados por essa conta.",
      };
    }
    const message = searchParams.get("message");
    return {
      variant: "destructive",
      title: "Falha ao ligar Outlook",
      description: message
        ? decodeURIComponent(message)
        : "Tente novamente ou verifique o registo da aplicação no Azure AD.",
    };
  });
  const oauthHandled = useRef(false);

  useEffect(() => {
    if (oauthHandled.current) return;
    const o = searchParams.get("email_oauth");
    if (!o) return;
    oauthHandled.current = true;
    const t = searchParams.get("tab");
    const qs = new URLSearchParams();
    if (t && (TAB_VALUES as readonly string[]).includes(t)) qs.set("tab", t);
    router.replace(`/crm/admin/integracoes${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router]);

  return (
    <div className="w-full space-y-4">
      {oauthBanner && (
        <Alert variant={oauthBanner.variant === "destructive" ? "destructive" : "default"}>
          <AlertTitle>{oauthBanner.title}</AlertTitle>
          <AlertDescription>{oauthBanner.description}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="w-full space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1.5 sm:gap-2">
          <TabsTrigger
            value="rd"
            className="gap-1.5 px-3 py-2 text-xs sm:text-sm data-[state=active]:shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-70" />
            RD Station
          </TabsTrigger>
          <TabsTrigger
            value="sharepoint"
            className="gap-1.5 px-3 py-2 text-xs sm:text-sm data-[state=active]:shadow-sm"
          >
            <Cloud className="h-3.5 w-3.5 shrink-0 opacity-70" />
            SharePoint
          </TabsTrigger>
          <TabsTrigger
            value="email"
            className="gap-1.5 px-3 py-2 text-xs sm:text-sm data-[state=active]:shadow-sm"
          >
            <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" />
            E-mail (leads)
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="gap-1.5 px-3 py-2 text-xs sm:text-sm data-[state=active]:shadow-sm"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-70" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rd" className="mt-0 outline-none focus-visible:ring-0">
          <RdSyncAdminPanel />
        </TabsContent>

        <TabsContent value="sharepoint" className="mt-0 outline-none focus-visible:ring-0">
          <SharePointConfigPanel />
        </TabsContent>

        <TabsContent value="email" className="mt-0 outline-none focus-visible:ring-0">
          <LeadEmailConfigPanel />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0 outline-none focus-visible:ring-0">
          <WhatsappDueConfigPanel
            initialConfig={whatsappInitialConfig}
            initialConfigs={whatsappInitialConfigs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
