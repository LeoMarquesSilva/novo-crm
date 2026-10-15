import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ContractConfigureContext = {
  opportunityId: string | null;
  opportunityStage: string | null;
  versionNumber: number | null;
  versionStatus: string | null;
};

/** Contexto para `canConfigureContract` (Financeiro só no contrato do lead em Inclusão no Faturamento). */
export async function loadContractConfigureContext(
  contractId: string,
  versionId?: string | null,
): Promise<ContractConfigureContext | null> {
  const supabase = createSupabaseAdminClient();
  const { data: contract } = await supabase
    .from("contratos")
    .select("id, oportunidade_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return null;
  const opportunityId = (contract as { oportunidade_id: string | null }).oportunidade_id;

  const versionQuery = supabase.from("contrato_versoes").select("numero, status").eq("contrato_id", contractId);
  const [{ data: version }, { data: opportunity }] = await Promise.all([
    versionId ? versionQuery.eq("id", versionId).maybeSingle() : versionQuery.eq("numero", 1).maybeSingle(),
    opportunityId
      ? supabase.from("oportunidades").select("etapa").eq("id", opportunityId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    opportunityId,
    opportunityStage: (opportunity as { etapa: string } | null)?.etapa ?? null,
    versionNumber: (version as { numero: number } | null)?.numero ?? null,
    versionStatus: (version as { status: string } | null)?.status ?? null,
  };
}
