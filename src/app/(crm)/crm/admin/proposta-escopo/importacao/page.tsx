import Link from "next/link";
import { ArrowLeft, FileUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScopeImportShell } from "@/components/crm/scope-import/scope-import-shell";

export const dynamic = "force-dynamic";

export default async function PropostaEscopoImportacaoPage() {
  await requireAdmin("/crm/admin/proposta-escopo/importacao");

  const catalog = await loadProposalCatalogAdmin();

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Importar escopos de documentos"
        description="Envie propostas e contratos em PDF/DOCX. A IA extrai e padroniza escopos e investimentos; você revisa antes de publicar no catálogo."
        icon={FileUp}
        actions={
          <Link
            href="/crm/admin/proposta-escopo"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao catálogo
          </Link>
        }
        stats={[
          { label: "Tipos de escopo", value: catalog.scopeTypeCount, detail: "no catálogo" },
          { label: "Investimentos", value: catalog.investmentSubtypeCount, detail: "modelos" },
        ]}
      />

      <ScopeImportShell catalog={catalog} />
    </div>
  );
}
