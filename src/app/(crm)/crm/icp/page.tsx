import { redirect } from "next/navigation";
import { Crosshair } from "lucide-react";

import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { IcpDashboard } from "@/components/crm/icp/icp-dashboard";
import { requireAuth } from "@/lib/auth/server";
import { hasModuleAccess } from "@/lib/auth/module-access";
import type { IcpData } from "@/modules/icp/domain/compute";
import { getIcpData } from "@/modules/icp/infrastructure/icp-data-loader";

export const dynamic = "force-dynamic";

export default async function IcpPage() {
  const { profile } = await requireAuth("/crm/icp");
  if (!(await hasModuleAccess(profile, "icp"))) {
    redirect("/crm");
  }

  let data: IcpData | null = null;
  let error: string | null = null;
  try {
    data = await getIcpData();
  } catch (err) {
    error = err instanceof Error ? err.message : "Não foi possível calcular o ICP.";
  }

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Inteligência comercial"
        title="ICP — perfil de cliente ideal"
        description="Quem é o cliente que mais rende para o escritório, calculado com os dados do VIOS, da Receita Federal, do LinkedIn e do marketing."
        icon={Crosshair}
      />
      <IcpDashboard data={data} error={error} />
    </div>
  );
}
