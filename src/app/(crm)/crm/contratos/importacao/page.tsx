import { FileUp } from "lucide-react";
import Link from "next/link";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { ContractImportShell } from "@/components/crm/contracts/contract-import-shell";
import { requireAuth } from "@/lib/auth/server";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContractImportPage() {
  const { profile } = await requireAuth("/crm/contratos/importacao");
  if (!canAccessContractCapability({ role: profile.role, capability: "configure" })) {
    redirect("/crm/contratos");
  }

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Gestão contratual"
        title="Importar contratos fechados"
        description="Envie PDFs assinados. A extração preenche o gerenciador financeiro; a revisão humana grava apenas rascunho."
        icon={FileUp}
        actions={
          <Link
            href="/crm/contratos"
            className="text-sm font-medium text-interactive-700 underline-offset-4 hover:underline"
          >
            Voltar aos contratos
          </Link>
        }
      />
      <ContractImportShell />
    </div>
  );
}
