import { BarChart3 } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { DashboardEtapaDistribution } from "@/components/crm/dashboard-etapa-distribution";
import { IndicatorApprovalQueue } from "@/components/crm/indicator-approval-queue";
import { KpiCards } from "@/components/crm/kpi-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrmOverview } from "@/modules/crm/application/services/get-crm-overview";
import { SupabaseCrmRepository } from "@/modules/crm/infrastructure/repositories/supabase-crm-repository";

export const dynamic = "force-dynamic";

export default async function CrmDashboardPage() {
  const repository = new SupabaseCrmRepository();
  const [overview, indicadoresPendentes, countsByEtapa] = await Promise.all([
    getCrmOverview(repository),
    repository.listIndicadoresPendentes(),
    repository.getOportunidadesCountByEtapa(),
  ]);

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Visão executiva"
        title="Dashboard comercial"
        description="Um resumo claro das oportunidades, clientes, contratos e pendências que movem a operação jurídica."
        icon={BarChart3}
      />

      <KpiCards overview={overview} />

      <Card className="glass-card-no-float p-6">
        <CardHeader className="px-0">
          <CardTitle className="heading-lg">Oportunidades por etapa</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <DashboardEtapaDistribution countsByEtapa={countsByEtapa} />
        </CardContent>
      </Card>

      <IndicatorApprovalQueue items={indicadoresPendentes} />
    </div>
  );
}
