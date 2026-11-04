import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/http/api-errors";

import { includeLeadContract, type ContractInclusionResult } from "./include-lead-contract";

/**
 * Inclusão automática no gerenciamento de contratos (03/11/2026): ao entrar em Inclusão no
 * Faturamento, o CRM faz sozinho o que o botão "Incluir" fazia (cadastro + leitura do PDF
 * assinado). Contrato já incluído ou já configurado à mão não é relido (lead que volta à etapa).
 * Falha vira log: o Financeiro inclui pela configuração do contrato ("Incluir dados do lead").
 */
export async function autoIncludeLeadContract(
  supabase: SupabaseClient,
  opportunityId: string,
): Promise<ContractInclusionResult | null> {
  try {
    const { data: contract } = await supabase
      .from("contratos")
      .select("id")
      .eq("oportunidade_id", opportunityId)
      .maybeSingle();
    if (contract) {
      const { data: version } = await supabase
        .from("contrato_versoes")
        .select("id, origem_snapshot")
        .eq("contrato_id", (contract as { id: string }).id)
        .eq("numero", 1)
        .maybeSingle();
      const v = version as { id: string; origem_snapshot: unknown } | null;
      const snapshot = v?.origem_snapshot as { leadInclusion?: { prefilledAt?: string | null } } | null;
      if (snapshot?.leadInclusion?.prefilledAt) return null;
      if (v) {
        const { count } = await supabase
          .from("contrato_componentes_cobranca")
          .select("id", { count: "exact", head: true })
          .eq("versao_id", v.id);
        if ((count ?? 0) > 0) return null;
      }
    }
    return await includeLeadContract(supabase, { opportunityId, actor: null, mode: "initial" });
  } catch (error) {
    logServerError("contract-inclusion/auto", error, { opportunityId });
    return null;
  }
}
