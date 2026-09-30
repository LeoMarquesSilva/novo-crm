import Link from "next/link";
import { ArrowLeft, BookOpenText, FileUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClauseRow } from "@/components/crm/clause-templates-admin-panel";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScopeCatalogShell } from "@/components/crm/scope-catalog/scope-catalog-shell";

export const dynamic = "force-dynamic";

const CLAUSE_SELECT =
  "id, title, content, category, sort_order, is_active, created_at, updated_at, stable_key, version, status, role, is_required, placeholders, legal_review_note, area_key, scope_subtype_key";

/** `null` mantém o catálogo funcionando sem o atalho de cláusulas se a leitura falhar. */
async function getClauses(): Promise<ClauseRow[] | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("contract_clause_templates")
      .select(CLAUSE_SELECT)
      .order("category")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error("[proposta-escopo] falha ao carregar cláusulas", err);
    return null;
  }
}

export default async function PropostaEscopoAdminPage() {
  await requireAdmin("/crm/admin/proposta-escopo");

  const [catalog, clauses] = await Promise.all([loadProposalCatalogAdmin(), getClauses()]);

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
        actions={
          <Link
            href="/crm/admin/proposta-escopo/importacao"
            className={cn(buttonVariants({ variant: "teal", size: "sm" }), "gap-2")}
          >
            <FileUp className="size-4" aria-hidden />
            Importar de documentos
          </Link>
        }
      />

      <ScopeCatalogShell initialData={catalog} initialClauses={clauses} />
    </div>
  );
}
