"use client";

import { useState } from "react";
import { BarChart3, CalendarClock, FileSignature, FolderKanban, ReceiptText } from "lucide-react";

import { D4SignDashboard } from "@/components/crm/d4sign-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";
import { ContractPortfolioTab } from "./contract-portfolio-tab";

type D4SignProps = Parameters<typeof D4SignDashboard>[0];

const initialFilters = { search: "", manager: "", area: "", tag: "", origin: "", lifecycle: "", billingKind: "", renewal: "" };

export function ContractsHub({ portfolio, portfolioError, d4sign, d4signError }: { portfolio: ContractPortfolioItem[]; portfolioError: string | null; d4sign: D4SignProps; d4signError: string | null }) {
  const [filters, setFilters] = useState(initialFilters);
  const active = portfolio.filter((item) => item.lifecycle === "ativo").length;
  const pendingClosings = portfolio.reduce((sum, item) => sum + item.pendingClosingCount, 0);
  const renewals = portfolio.filter((item) => item.renewalSoon).length;
  const annualCents = portfolio.reduce((sum, item) => sum + Number(item.annualReferenceCents ?? 0), 0);

  return <Tabs defaultValue="portfolio" className="gap-4">
    <div className="overflow-x-auto pb-1"><TabsList variant="line" className="min-w-max justify-start">
      <TabsTrigger value="portfolio"><FolderKanban />Carteira</TabsTrigger>
      <TabsTrigger value="closings"><ReceiptText />Fechamentos</TabsTrigger>
      <TabsTrigger value="renewals"><CalendarClock />Renovações</TabsTrigger>
      <TabsTrigger value="indicators"><BarChart3 />Indicadores</TabsTrigger>
      <TabsTrigger value="d4sign"><FileSignature />Assinaturas D4Sign</TabsTrigger>
    </TabsList></div>
    <TabsContent value="portfolio"><ContractPortfolioTab items={portfolio} error={portfolioError} filters={filters} onFiltersChange={setFilters} /></TabsContent>
    <TabsContent value="closings"><SummaryPlaceholder title="Fechamentos mensais" description="A preparação e aprovação entram na próxima etapa. Este resumo já usa os fechamentos disponíveis." stats={[["Pendentes", pendingClosings], ["Contratos com histórico", portfolio.filter((item) => item.closingCount > 0).length], ["Ativos", active]]} /></TabsContent>
    <TabsContent value="renewals"><SummaryPlaceholder title="Renovações e reajustes" description="A rotina de alertas entra na próxima etapa. Por enquanto, acompanhe as datas já cadastradas." stats={[["Próximos 90 dias", renewals], ["Sem data-base", portfolio.filter((item) => !item.renewalDate).length], ["Contratos ativos", active]]} /></TabsContent>
    <TabsContent value="indicators"><SummaryPlaceholder title="Indicadores da carteira" description="Leitura consolidada dos dados disponíveis na carteira atual." stats={[["Valor anual de referência", new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(annualCents / 100)], ["Contratos ativos", active], ["Em implantação", portfolio.filter((item) => item.lifecycle === "rascunho" || item.lifecycle === "em_revisao").length]]} /></TabsContent>
    <TabsContent value="d4sign">{d4signError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Erro ao carregar assinaturas: {d4signError}</div> : <D4SignDashboard {...d4sign} />}</TabsContent>
  </Tabs>;
}

function SummaryPlaceholder({ title, description, stats }: { title: string; description: string; stats: Array<[string, string | number]> }) {
  return <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-zinc-900">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{stats.map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold text-zinc-900">{value}</p></div>)}</div></section>;
}
