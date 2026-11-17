import { DashboardAttentionList } from "@/components/crm/dashboard-attention-list";
import { DashboardPeriodSelect } from "@/components/crm/dashboard-period-select";
import { DashboardPipelineCard } from "@/components/crm/dashboard-pipeline-card";
import { DashboardQuickActions } from "@/components/crm/dashboard-quick-actions";
import { IndicatorApprovalQueue } from "@/components/crm/indicator-approval-queue";
import { KpiCards } from "@/components/crm/kpi-cards";
import { requireAuth } from "@/lib/auth/server";
import { countInWindows, parseDashboardPeriod, periodWindow, saudacaoBr } from "@/lib/crm/dashboard-period";
import { loadDashboardPeriodCounts } from "@/lib/crm/dashboard-period-counts";
import {
  buildConversionFunnel,
  countActiveLeads,
  summarizePipelineForDashboard,
} from "@/lib/crm/dashboard-pipeline-summary";
import { loadPipelineLeads } from "@/lib/crm/pipeline-leads";
import { getCrmOverview } from "@/modules/crm/application/services/get-crm-overview";
import { SupabaseCrmRepository } from "@/modules/crm/infrastructure/repositories/supabase-crm-repository";

export const dynamic = "force-dynamic";

export default async function CrmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const { profile } = await requireAuth("/crm");
  const periodo = parseDashboardPeriod((await searchParams).periodo);
  const janela = periodWindow(periodo);
  const repository = new SupabaseCrmRepository();
  // Os leads vêm da mesma carga do kanban, para os números baterem com o quadro.
  const [overview, indicadoresPendentes, pipeline, periodCounts] = await Promise.all([
    getCrmOverview(repository),
    repository.listIndicadoresPendentes(),
    loadPipelineLeads(),
    loadDashboardPeriodCounts(janela),
  ]);
  const summary = summarizePipelineForDashboard(pipeline.opportunities);
  const funnel = buildConversionFunnel(pipeline.opportunities);
  const oportunidadesAtivas = countActiveLeads(pipeline.opportunities);
  const novasOportunidades = countInWindows(
    pipeline.opportunities.map((o) => o.criadoEm),
    janela,
  );
  const podeCriarLead = profile.role === "admin" || profile.role === "comercial";
  const primeiroNome = profile.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] text-muted-foreground">
            {saudacaoBr()}
            {primeiroNome ? `, ${primeiroNome}` : ""}
          </p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-9 tracking-[-0.02em] text-foreground">
            Dashboard comercial
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Um resumo claro das oportunidades, clientes, contratos e pendências que movem a operação jurídica.
          </p>
        </div>
        <DashboardPeriodSelect value={periodo} />
      </header>

      <KpiCards
        oportunidades={{ total: oportunidadesAtivas, novas: novasOportunidades }}
        clientes={{ total: overview.totalClientes, novos: periodCounts.clientes }}
        contratos={{ total: overview.totalContratos, novos: periodCounts.contratos }}
        indicadoresPendentes={overview.indicadoresPendentes}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardPipelineCard funnel={funnel} summary={summary} />
        <div className="space-y-6">
          <DashboardQuickActions podeCriarLead={podeCriarLead} />
          <DashboardAttentionList
            atencao={summary.atencao}
            indicadoresPendentes={overview.indicadoresPendentes}
            canViewDueDiligence={podeCriarLead}
          />
        </div>
      </div>

      <IndicatorApprovalQueue items={indicadoresPendentes} />
    </div>
  );
}
