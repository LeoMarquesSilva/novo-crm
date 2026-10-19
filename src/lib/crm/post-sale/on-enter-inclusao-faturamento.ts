import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyAudience } from "@/lib/crm/notifications/crm-notify";

/**
 * Lead entrou em Inclusão no Faturamento (cadastro concluído por Operações Legais ou
 * movido pelo admin): alerta de implantação no contrato e aviso ao Financeiro (+
 * controladoria e responsável operacional do contrato), no sino e por e-mail.
 * Idempotente pela chave `contract-setup:{contratoId}`.
 */
export async function onEnteredInclusaoFaturamento(
  supabase: SupabaseClient,
  input: { opportunityId: string; leadName?: string | null },
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

  const leadName = input.leadName?.trim() || row.titulo || "Contrato";
  await notifyAudience(
    supabase,
    { roles: ["financeiro", "controladoria"], appUserIds: [operationalId] },
    {
      tipo: "faturamento_inclusao_pendente",
      title: `Incluir no faturamento — ${leadName}`,
      preview:
        "Cadastro do cliente concluído. Inclua o contrato no gerenciamento de contratos (regras de cobrança) e ative.",
      path: `/crm/leads/${encodeURIComponent(input.opportunityId)}?tab=billing`,
      idempotencyKey,
      extra: { oportunidade_id: input.opportunityId, contrato_id: row.id },
    },
  );
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
