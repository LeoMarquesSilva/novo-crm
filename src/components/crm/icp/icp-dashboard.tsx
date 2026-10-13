"use client";

/**
 * Tela do ICP (perfil de cliente ideal). A página renderiza o `CrmPageHeader` acima;
 * este componente começa nas abas, na linha "calculado em ..." e no botão Recalcular.
 */
import { useState, useTransition, type JSX } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IcpData } from "@/modules/icp/domain/compute";
import { CarteiraTab } from "./icp-carteira-tab";
import { ClientesTab } from "./icp-clientes-tab";
import { ComercialTab } from "./icp-comercial-tab";
import { ICP_TABS, type IcpTabKey } from "./icp-content";
import { monthLabel } from "./icp-format";
import { MarketingTab } from "./icp-marketing-tab";
import { ResumoTab } from "./icp-resumo-tab";

export const ICP_REFRESH_ENDPOINT = "/api/crm/icp/refresh";

const REFRESH_FALLBACK_ERROR = "Não foi possível recalcular.";

export function IcpDashboard({ data, error }: { data: IcpData | null; error: string | null }): JSX.Element {
  const router = useRouter();
  const [tab, setTab] = useState<IcpTabKey>("resumo");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(ICP_REFRESH_ENDPOINT, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        throw new Error(body?.error || REFRESH_FALLBACK_ERROR);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : REFRESH_FALLBACK_ERROR);
    } finally {
      setRefreshing(false);
    }
  }

  const refreshIcon = <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />;

  if (!data) {
    return (
      <div className="flex flex-col items-center rounded-(--radius-v2-xl) border border-border bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-foreground">O ICP não pôde ser calculado.</p>
        <p className="mt-1 max-w-md text-[13px] leading-5 text-muted-foreground">
          {error ?? "Verifique a conexão com o VIOS e tente novamente."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh} disabled={refreshing}>
          {refreshIcon}
          Tentar de novo
        </Button>
        {refreshError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-text">
            {refreshError}
          </p>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as IcpTabKey)} className="w-full min-w-0 gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:border-b lg:border-border">
          <div className="max-w-full overflow-x-auto overflow-y-hidden border-b border-border lg:border-b-0">
            <TabsList variant="line" aria-label="Seções do ICP" className="h-auto min-w-max justify-start gap-1 bg-transparent p-0">
              {ICP_TABS.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="h-10 flex-none px-3 text-sm font-medium group-data-horizontal/tabs:after:bottom-0"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end lg:py-1">
            <p className="text-xs text-muted-foreground">
              Honorários pagos de {monthLabel(data.windowStart)} a {monthLabel(data.windowEnd)} · calculado em{" "}
              <span className="tabular-nums">
                {new Date(data.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshIcon}
              {refreshing ? "Recalculando..." : "Recalcular"}
            </Button>
          </div>
        </div>

        {refreshError && (
          <div
            role="alert"
            className="rounded-(--radius-v2-md) border border-danger-border bg-danger-bg px-4 py-2 text-sm text-danger-text"
          >
            {refreshError}
          </div>
        )}

        <TabsContent value="resumo">
          <ResumoTab data={data} />
        </TabsContent>
        <TabsContent value="carteira">
          <CarteiraTab data={data} />
        </TabsContent>
        <TabsContent value="clientes">
          <ClientesTab data={data} />
        </TabsContent>
        <TabsContent value="marketing">
          <MarketingTab data={data} />
        </TabsContent>
        <TabsContent value="comercial">
          <ComercialTab />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}
