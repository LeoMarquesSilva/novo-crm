import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { autoIncludeLeadContract } from "@/lib/crm/contract-inclusion/auto-include";
import { contractSetupHref } from "@/lib/crm/contract-inclusion/lead-inclusion-view";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { logServerError } from "@/lib/http/api-errors";

/** Depois da resposta (a leitura do PDF leva até 90 s); fora de uma requisição, roda direto. */
function afterResponse(task: () => Promise<void>, opportunityId: string): void {
  const run = () => task().catch((error: unknown) => logServerError("post-sale/inclusao-faturamento", error, { opportunityId }));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Lead entrou em Inclusão no Faturamento (cadastro concluído por Operações Legais ou
 * movido pelo admin): alerta de implantação no contrato e aviso ao Financeiro (+
 * controladoria e responsável operacional do contrato), no sino e por e-mail.
 * Idempotente pela chave `contract-setup:{contratoId}`.
 * Desde 03/11/2026 o contrato é incluído no gerenciamento automaticamente (depois da
 * resposta) e só então sai o aviso, que abre direto a configuração do contrato.
 */
export async function onEnteredInclusaoFaturamento(
  supabase: SupabaseClient,
  input: {
    opportunityId: string;
    leadName?: string | null;
    /** `false` só abre o alerta (ex.: conversão em lote da virada do RD, sem um aviso por lead). */
    notify?: boolean;
    /** Inclusão automática no gerenciamento; padrão: junto com o aviso (lote da virada não lê PDF por lead). */
    autoInclude?: boolean;
  },
): Promise<void> {
  const { data: contract } = await supabase
    .from("contratos")
    .select("id, titulo")
    .eq("oportunidade_id", input.opportunityId)
    .maybeSingle();
  if (!contract) return;
  const row = contract as { id: string; titulo: string | null };
  const idempotencyKey = `contract-setup:${row.id}`;

  const { data: operational } = await supabase
    .from("contrato_responsaveis")
    .select("app_user_id")
    .eq("contrato_id", row.id)
    .or("papel.ilike.%operacional%,papel.ilike.%faturamento%")
    .not("app_user_id", "is", null)
    .limit(1)
    .maybeSingle();
  const operationalId = (operational as { app_user_id: string | null } | null)?.app_user_id ?? null;

  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("contrato_alertas").upsert(
    {
      contrato_id: row.id,
      tipo: "contrato_implantacao_pendente",
      data_base: today,
      data_vencimento: today,
      responsavel_app_user_id: operationalId,
      idempotency_key: idempotencyKey,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  const autoInclude = input.autoInclude ?? input.notify !== false;
  if (!autoInclude && input.notify === false) return;
  const leadName = input.leadName?.trim() || row.titulo || "Contrato";
  afterResponse(async () => {
    const included = autoInclude ? await autoIncludeLeadContract(supabase, input.opportunityId) : null;
    if (input.notify === false) return;
    await notifyAudience(
      supabase,
      { roles: ["financeiro", "controladoria"], appUserIds: [operationalId] },
      {
        tipo: "faturamento_inclusao_pendente",
        title: `Incluir no faturamento — ${leadName}`,
        preview: included
          ? "Contrato já incluído no gerenciamento com os dados do cadastro e do PDF assinado. Confira a configuração e ative."
          : "Confira o contrato no gerenciamento de contratos (regras de cobrança) e ative.",
        path: contractSetupHref(row.id, input.opportunityId),
        idempotencyKey,
        extra: { oportunidade_id: input.opportunityId, contrato_id: row.id },
      },
    );
  }, input.opportunityId);
}

/**
 * Contrato ativado = implantação concluída: fecha o alerta `contrato_implantacao_pendente`
 * que a entrada em Inclusão no Faturamento abriu (e o job diário reabriria enquanto o lead
 * estivesse nessa etapa).
 */
export async function resolveContractSetupAlert(
  supabase: SupabaseClient,
  input: { contractId: string; actorAppUserId: string; now?: string },
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const { error } = await supabase
    .from("contrato_alertas")
    .update({
      status: "resolvido",
      resolvido_em: now,
      resolvido_por: input.actorAppUserId,
      resolucao: JSON.stringify({ conclusion: "Contrato ativado no gerenciamento de contratos." }),
      updated_at: now,
    })
    .eq("contrato_id", input.contractId)
    .eq("tipo", "contrato_implantacao_pendente")
    .neq("status", "resolvido");
  if (error) throw error;
}
