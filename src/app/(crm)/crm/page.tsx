import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileSignature,
  FolderKanban,
  Gauge,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { DashboardEtapaDistribution } from "@/components/crm/dashboard-etapa-distribution";
import { IndicatorApprovalQueue } from "@/components/crm/indicator-approval-queue";
import { KpiCards } from "@/components/crm/kpi-cards";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/server";
import { cn } from "@/lib/utils";
import { getCrmOverview } from "@/modules/crm/application/services/get-crm-overview";
import { SupabaseCrmRepository } from "@/modules/crm/infrastructure/repositories/supabase-crm-repository";

export const dynamic = "force-dynamic";

export default async function CrmDashboardPage() {
  const { profile } = await requireAuth("/crm");
  const repository = new SupabaseCrmRepository();
  const [overview, indicadoresPendentes, countsByEtapa] = await Promise.all([
    getCrmOverview(repository),
    repository.listIndicadoresPendentes(),
    repository.getOportunidadesCountByEtapa(),
  ]);
  const activeStages = Object.values(countsByEtapa).filter((count) => (count ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="Visão executiva"
        title="Dashboard comercial"
        description="Um resumo claro das oportunidades, clientes, contratos e pendências que movem a operação jurídica."
        icon={BarChart3}
        actions={
          <Link
            href="/crm/leads"
            className={cn(buttonVariants({ variant: "cta", size: "sm" }), "gap-2")}
          >
            Abrir pipeline
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <KpiCards overview={overview} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) bg-interactive-50 text-interactive-700">
                <Gauge className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-v2-heading-md">Oportunidades por etapa</CardTitle>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  Distribuição atual do pipeline comercial.
                </p>
              </div>
            </div>
            <Link
              href="/crm/leads"
              className="hidden shrink-0 items-center gap-1.5 text-xs font-semibold text-interactive-700 transition-colors hover:text-interactive-800 hover:underline sm:inline-flex"
            >
              Ver quadro
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent className="px-5 py-5 sm:px-6">
            <DashboardEtapaDistribution countsByEtapa={countsByEtapa} />
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-v2-heading-md">Acessos rápidos</CardTitle>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {overview.totalOportunidades} oportunidades distribuídas em {activeStages} etapas.
            </p>
          </CardHeader>
          <CardContent className="p-2">
            <DashboardShortcut
              href="/crm/leads"
              icon={FolderKanban}
              title="Pipeline de leads"
              description="Acompanhar etapas e responsáveis"
            />
            <DashboardShortcut
              href="/crm/clientes"
              icon={Building2}
              title="Base de clientes"
              description="Consultar cadastros ativos"
            />
            <DashboardShortcut
              href="/crm/contratos"
              icon={FileSignature}
              title="Contratos"
              description="Revisar carteira e assinaturas"
            />
            {profile.role === "admin" || profile.role === "comercial" ? (
              <DashboardShortcut
                href="/crm/due-diligence"
                icon={Presentation}
                title="Due diligence"
                description="Acompanhar prazos, fases e atrasos"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <IndicatorApprovalQueue items={indicadoresPendentes} />
    </div>
  );
}

function DashboardShortcut({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-(--radius-v2-lg) px-3 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-white text-muted-foreground transition-colors group-hover:border-interactive-200 group-hover:text-interactive-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-interactive-600" aria-hidden />
    </Link>
  );
}
