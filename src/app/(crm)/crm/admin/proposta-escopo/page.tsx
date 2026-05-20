import { BookOpenText } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { ScopeCatalogShell } from "@/components/crm/scope-catalog/scope-catalog-shell";

export const dynamic = "force-dynamic";

export default async function PropostaEscopoAdminPage() {
  await requireAdmin("/crm/admin/proposta-escopo");

  const catalog = await loadProposalCatalogAdmin();

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Catálogo de Escopos"
        description="Crie e edite modelos de escopo e investimento por área. As propostas usam estes catálogos como ponto de partida."
        icon={BookOpenText}
        stats={[
          {
            label: "Áreas",
            value: Object.keys(catalog.scope).length,
            detail: "configuradas",
          },
          {
            label: "Tipos de escopo",
            value: catalog.scopeTypeCount,
            detail: "modelos por área",
          },
          {
            label: "Subtipos",
            value: catalog.scopeSubtypeCount,
            detail: "variações editáveis",
          },
          {
            label: "Investimentos",
            value: catalog.investmentSubtypeCount,
            detail: "modelos de cobrança",
          },
        ]}
      />

      <ScopeCatalogShell initialData={catalog} />
    </div>
  );
}
