import { AlertCircle, BookText } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClauseTemplatesAdminPanel } from "@/components/crm/clause-templates-admin-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CONTRACT_SCOPE_PROFILES } from "@/lib/crm/contract-engine/scope-profiles";
import { loadProposalCatalog } from "@/lib/crm/proposal-catalog-db";

export const dynamic = "force-dynamic";

const CLAUSE_SELECT =
  "id, title, content, category, sort_order, is_active, created_at, updated_at, stable_key, version, status, role, is_required, placeholders, legal_review_note, area_key, scope_subtype_key";

async function getClauses() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .select(CLAUSE_SELECT)
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

  const supabase = createSupabaseAdminClient();
  const [{ clauses, error: fetchError }, catalog] = await Promise.all([
    getClauses(),
    loadProposalCatalog(supabase),
  ]);

  const total = clauses.length;
  const active = clauses.filter((c) => c.is_active).length;
  const pendingReview = clauses.filter((c) => c.status === "pending_legal_review").length;

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Biblioteca de Cláusulas"
        description="Catálogo do motor de contratos, organizado por Área → Tipo → Subtipo de escopo (mesma estrutura da proposta). Os textos estão em revisão jurídica e ainda não são cláusula oficial. Áreas sem subtipo cadastrado não têm perfil de contrato — não inventamos redação."
        icon={BookText}
        stats={[
          { label: "Total de modelos", value: total, detail: "cláusulas do motor" },
          { label: "Ativas", value: active, detail: "usadas na geração do contrato" },
          { label: "Em revisão", value: pendingReview, detail: "pendentes do Societário" },
          { label: "Perfis", value: CONTRACT_SCOPE_PROFILES.length, detail: "só área trabalhista, por ora" },
        ]}
      />

      {fetchError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar cláusulas</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : (
        <ClauseTemplatesAdminPanel initialClauses={clauses} catalog={catalog.scope} />
      )}
    </div>
  );
}
