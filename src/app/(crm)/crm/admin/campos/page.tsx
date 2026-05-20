import { AlertCircle, Layers } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbFieldToDefinition } from "@/lib/crm/compute-transition-requirements";
import { FieldConfigPanel } from "@/components/crm/field-config-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

async function getFields(pipelineCode: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("pipeline_code", pipelineCode)
      .order("stage_code", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return {
      fields: (data ?? []).map((row) =>
        mapDbFieldToDefinition(row as Record<string, unknown>),
      ),
      error: null,
    };
  } catch (err) {
    return {
      fields: [],
      error: err instanceof Error ? err.message : "Erro ao carregar campos",
    };
  }
}

export default async function CamposAdminPage() {
  await requireAdmin("/crm/admin/campos");

  const [vendas, posVenda] = await Promise.all([
    getFields("vendas"),
    getFields("pos_venda"),
  ]);

  const fetchError = vendas.error ?? posVenda.error;

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Configuração de campos"
        description="Gerencie os campos obrigatórios, tipos de entrada e regras de cada etapa por funil."
        icon={Layers}
        stats={[
          { label: "Funil de vendas", value: vendas.fields.length, detail: "campos configurados" },
          { label: "Pós-venda", value: posVenda.fields.length, detail: "campos configurados" },
        ]}
      />

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar campos</AlertTitle>
          <AlertDescription>
            {fetchError}
            {fetchError.includes("SUPABASE_SERVICE_ROLE_KEY") && (
              <span className="mt-1 block text-xs">
                Adicione <code>SUPABASE_SERVICE_ROLE_KEY</code> ao <code>.env</code>{" "}
                (Supabase → Settings → API → service_role key).
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="vendas">
        <TabsList className="border border-slate-200 bg-white shadow-sm">
          <TabsTrigger value="vendas">
            Funil de Vendas
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-primary-dark ring-1 ring-slate-200">
              {vendas.fields.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="pos_venda">
            Pós-Venda
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-primary-dark ring-1 ring-slate-200">
              {posVenda.fields.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-4">
          <FieldConfigPanel initialFields={vendas.fields} pipelineCode="vendas" />
        </TabsContent>

        <TabsContent value="pos_venda" className="mt-4">
          <FieldConfigPanel initialFields={posVenda.fields} pipelineCode="pos_venda" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
