import { AlertCircle, BookText } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClauseTemplatesAdminPanel } from "@/components/crm/clause-templates-admin-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

async function getClauses() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .select("id, title, content, category, sort_order, is_active, created_at, updated_at")
      .order("category")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return { clauses: data ?? [], error: null };
  } catch (err) {
    return {
      clauses: [],
      error: err instanceof Error ? err.message : "Erro ao carregar cláusulas",
    };
  }
}

export default async function ClausulasAdminPage() {
  await requireAdmin("/crm/admin/clausulas");

  const { clauses, error: fetchError } = await getClauses();

  const total = clauses.length;
  const active = clauses.filter((c) => c.is_active).length;
  const categories = new Set(clauses.map((c) => c.category)).size;

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Biblioteca de Cláusulas"
        description="Crie e gerencie modelos de cláusulas pré-moldadas para uso no builder de contratos."
        icon={BookText}
        stats={[
          { label: "Total de modelos", value: total, detail: "cláusulas cadastradas" },
          { label: "Ativas", value: active, detail: "disponíveis no builder" },
          { label: "Categorias", value: categories, detail: "grupos distintos" },
        ]}
      />

      {fetchError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar cláusulas</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : (
        <ClauseTemplatesAdminPanel initialClauses={clauses} />
      )}
    </div>
  );
}
