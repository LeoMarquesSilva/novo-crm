import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAtomicTransitionRpcArgs } from "@/lib/crm/atomic-transition";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { loadSignedContractPdf } from "@/lib/d4sign/signed-pdf-cache";
import { logServerError } from "@/lib/http/api-errors";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type SignatureCompletionSource = "webhook" | "sync" | "manual";

export type SignatureCompletionOutcome =
  | "completed"
  | "already_completed"
  | "not_current_document"
  | "lead_lost"
  | "stage_not_eligible";

export type CompleteSignedContractResult = {
  outcome: SignatureCompletionOutcome;
  saleClosed: boolean;
  stage: OpportunityStage | null;
  contractId: string | null;
  signedTransitionId: string | null;
  postsaleTransitionId: string | null;
};

type RpcRow = {
  outcome: string;
  signed_transition_id: string | null;
  postsale_transition_id: string | null;
  sale_closed: boolean;
  contract_id: string | null;
  stage: OpportunityStage;
};

function isMissingRpc(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204";
}

/** Lead importado do RD: só leitura no CRM (não avança pós-venda nem dispara o aviso geral). */
async function isRdLead(supabase: SupabaseClient, opportunityId: string): Promise<boolean> {
  const { data } = await supabase
    .from("rd_deal_reconciliacao")
    .select("detalhes")
    .eq("oportunidade_id", opportunityId)
    .limit(1)
    .maybeSingle();
  return Boolean((data as { detalhes?: unknown } | null)?.detalhes);
}

/** Caminho antigo, enquanto a migration 20261015125000 não está aplicada. */
async function completeWithoutRpc(
  supabase: SupabaseClient,
  input: { opportunityId: string; documentUuid: string | null; signers: unknown; autoAdvance: boolean; now: string },
): Promise<CompleteSignedContractResult> {
  const { data: opp, error: oppError } = await supabase
    .from("oportunidades")
    .select("etapa, encerramento, d4sign_document_uuid")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (oppError) throw oppError;
  const row = opp as { etapa: OpportunityStage; encerramento: string | null; d4sign_document_uuid: string | null } | null;
  if (!row) throw new Error("OPPORTUNITY_NOT_FOUND");
  if (row.d4sign_document_uuid && input.documentUuid && row.d4sign_document_uuid !== input.documentUuid) {
    return emptyResult("not_current_document", row.etapa);
  }
  if (row.encerramento === "perdido") return emptyResult("lead_lost", row.etapa);

  const { data: signedTransitionId, error: finalizeError } = await supabase.rpc("finalize_d4sign_opportunity", {
    p_opportunity_id: input.opportunityId,
    p_signers: (input.signers ?? []) as never,
    p_now: input.now,
  });
  if (finalizeError) throw finalizeError;
  let stage: OpportunityStage = signedTransitionId ? "contrato_assinado" : row.etapa;

  let saleClosed = false;
  if (row.encerramento !== "ganho" && stage !== "contrato_enviado") {
    const { error } = await supabase
      .from("oportunidades")
      .update({ encerramento: "ganho", venda_fechada_em: input.now } as never)
      .eq("id", input.opportunityId);
    if (error && isMissingRelation(error)) {
      await supabase.from("oportunidades").update({ encerramento: "ganho" } as never).eq("id", input.opportunityId);
    }
    saleClosed = true;
  }

  let postsaleTransitionId: string | null = null;
  if (input.autoAdvance && stage === "contrato_assinado") {
    const { data, error } = await supabase
      .rpc(
        "transition_opportunity_atomic",
        buildAtomicTransitionRpcArgs({
          opportunityId: input.opportunityId,
          expectedStage: "contrato_assinado",
          nextStage: "aguardando_cadastro",
          changedBy: null,
          update: { updated_at: input.now },
          leadIntake: null,
          fieldValues: [],
        }),
      )
      .single();
    if (!error) {
      postsaleTransitionId = (data as { transition_id?: string } | null)?.transition_id ?? null;
      stage = "aguardando_cadastro";
    } else {
      logServerError("complete-signed-contract/advance", error, { opportunityId: input.opportunityId });
    }
  }

  if (stage === "aguardando_cadastro") {
    const { error } = await supabase
      .from("lead_client_onboarding")
      .upsert({ oportunidade_id: input.opportunityId, status: "rascunho" } as never, {
        onConflict: "oportunidade_id",
        ignoreDuplicates: true,
      });
    if (error && !isMissingRelation(error)) logServerError("complete-signed-contract/onboarding", error);
  }

  return {
    outcome: signedTransitionId || postsaleTransitionId || saleClosed ? "completed" : "already_completed",
    saleClosed,
    stage,
    contractId: null,
    signedTransitionId: (signedTransitionId as string | null) ?? null,
    postsaleTransitionId,
  };
}

function emptyResult(outcome: SignatureCompletionOutcome, stage: OpportunityStage | null): CompleteSignedContractResult {
  return { outcome, saleClosed: false, stage, contractId: null, signedTransitionId: null, postsaleTransitionId: null };
}

/** Guarda o PDF assinado sem segurar a resposta (fora de uma requisição, só dispara). */
function cacheSignedPdfLater(documentUuid: string): void {
  const task = () =>
    loadSignedContractPdf(documentUuid, {
      allowDownload: true,
      source: "signature-completed",
      respectHumanReserve: true,
    }).then(
      () => undefined,
      () => undefined,
    );
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Todos assinaram o documento atual na D4Sign. Um só caminho para o webhook, o sync e o
 * override de admin: move para Contrato Assinado, encerra a venda como ganha, inicia o
 * pós-venda (Aguardando Cadastro), registra no histórico, avisa equipe do lead, sócios,
 * comercial + admin, Operações Legais e Financeiro (sino + e-mail) e guarda o PDF assinado.
 * Idempotente: a segunda chamada não duplica transição, atividade nem aviso.
 */
export async function completeSignedContract(input: {
  supabase: SupabaseClient;
  opportunityId: string;
  documentUuid: string | null;
  signers: unknown;
  signedAt?: string | null;
  source: SignatureCompletionSource;
  actorAppUserId?: string | null;
  leadName?: string | null;
  documentName?: string | null;
}): Promise<CompleteSignedContractResult> {
  const { supabase, opportunityId } = input;
  const now = new Date().toISOString();
  const rdLead = await isRdLead(supabase, opportunityId);

  const { data, error } = await supabase
    .rpc("complete_contract_signature_atomic", {
      p_opportunity_id: opportunityId,
      p_document_uuid: input.documentUuid,
      p_signers: (input.signers ?? null) as never,
      p_signed_at: input.signedAt ?? now,
      p_actor: input.actorAppUserId ?? null,
      p_source: input.source,
      p_auto_advance: !rdLead,
      p_now: now,
    })
    .maybeSingle();

  let result: CompleteSignedContractResult;
  if (error) {
    if (!isMissingRpc(error)) throw error;
    result = await completeWithoutRpc(supabase, {
      opportunityId,
      documentUuid: input.documentUuid,
      signers: input.signers,
      autoAdvance: !rdLead,
      now,
    });
  } else {
    const row = data as RpcRow | null;
    result = {
      outcome: (row?.outcome as SignatureCompletionOutcome) ?? "already_completed",
      saleClosed: Boolean(row?.sale_closed),
      stage: row?.stage ?? null,
      contractId: row?.contract_id ?? null,
      signedTransitionId: row?.signed_transition_id ?? null,
      postsaleTransitionId: row?.postsale_transition_id ?? null,
    };
  }

  if (result.outcome !== "completed") return result;

  const docLabel = input.documentName?.replace(/\.(docx?|pdf)$/i, "") ?? input.documentUuid ?? "contrato";
  const actor = input.actorAppUserId ?? null;

  if (result.signedTransitionId) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: opportunityId,
      kind: "contrato_assinado",
      title: `Contrato assinado — ${docLabel}`,
      detail: "Todos os signatários assinaram na D4Sign.",
      etapa: "contrato_assinado",
      actorAppUserId: actor,
      sourceId: `d4sign-final:${input.documentUuid ?? opportunityId}`,
      metadata: { document_uuid: input.documentUuid, source: input.source },
    });
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: opportunityId,
      kind: "etapa_alterada",
      title: "Etapa alterada",
      detail: "contrato_enviado → contrato_assinado",
      etapa: "contrato_assinado",
      actorAppUserId: actor,
      sourceId: `trans:${result.signedTransitionId}`,
      metadata: { from: "contrato_enviado", to: "contrato_assinado", trigger: "d4sign_finalizado" },
    });
  }
  if (result.saleClosed) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: opportunityId,
      kind: "venda_fechada",
      title: "Venda fechada",
      detail: "Contrato assinado por clientes e sócios: etapa de venda encerrada.",
      etapa: result.stage,
      actorAppUserId: actor,
      sourceId: `venda-fechada:${opportunityId}`,
    });
  }
  if (result.postsaleTransitionId) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: opportunityId,
      kind: "etapa_alterada",
      title: "Pós-venda iniciado",
      detail: "contrato_assinado → aguardando_cadastro",
      etapa: "aguardando_cadastro",
      actorAppUserId: actor,
      sourceId: `trans:${result.postsaleTransitionId}`,
      metadata: { from: "contrato_assinado", to: "aguardando_cadastro", trigger: "venda_fechada" },
    });
  }

  if (input.documentUuid) cacheSignedPdfLater(input.documentUuid);

  if (result.saleClosed) {
    const leadName = input.leadName?.trim() || "Lead";
    const leadPath = `/crm/leads/${encodeURIComponent(opportunityId)}`;
    try {
      await notifyAudience(
        supabase,
        rdLead
          ? { leadTeamOf: opportunityId }
          : {
              // Quem age no pós-venda (decisão de 19/10/2026): sem a lista inteira de admins e comerciais.
              leadTeamOf: opportunityId,
              firmPartners: true,
              roles: ["financeiro"],
              modules: ["operacoes_legais"],
            },
        {
          tipo: "venda_fechada",
          title: `Contrato assinado — ${leadName}`,
          preview: rdLead
            ? `O contrato "${docLabel}" foi assinado por todos.`
            : `Assinado por clientes e sócios. A venda foi encerrada e o pós-venda começou em Aguardando Cadastro.`,
          path: rdLead ? leadPath : `${leadPath}?tab=onboarding`,
          idempotencyKey: `venda-fechada:${opportunityId}`,
          extra: { oportunidade_id: opportunityId, uuid_doc: input.documentUuid },
        },
      );
      if (!rdLead && result.stage === "aguardando_cadastro") {
        await notifyAudience(
          supabase,
          { leadOwnerOf: opportunityId },
          {
            tipo: "cadastro_cliente_solicitado",
            title: `Preencha o cadastro do cliente — ${leadName}`,
            preview: "Confira os dados de cadastro e de faturamento e envie para Operações Legais.",
            path: `${leadPath}?tab=onboarding`,
            idempotencyKey: `cadastro-solicitado:${opportunityId}`,
            extra: { oportunidade_id: opportunityId },
          },
          { email: false },
        );
      }
    } catch (notifyError) {
      // Aviso não desfaz a assinatura concluída.
      logServerError("complete-signed-contract/notify", notifyError, { opportunityId });
    }
  }

  return result;
}
