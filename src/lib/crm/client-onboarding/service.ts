import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { evaluateLeadAction, type CrmActor, type PolicyDecision } from "@/lib/auth/crm-access-policy";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { onEnteredInclusaoFaturamento } from "@/lib/crm/post-sale/on-enter-inclusao-faturamento";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { RD_MIGRATION_PENDING_MESSAGE } from "@/lib/crm/rd-migration/state";
import { logServerError, PublicError } from "@/lib/http/api-errors";
import type { Json } from "@/lib/supabase/database.types";
import {
  adjustableFieldMeta,
  CLIENT_ONBOARDING_SCHEMA_VERSION,
  listMissingCadastroFields,
  listMissingChecklistItems,
  listMissingFaturamentoFields,
  onlyDigits,
  parseClientOnboardingPayload,
  type ClientOnboardingPayload,
  type OnboardingAdjustment,
  type OpsChecklist,
} from "@/modules/crm/domain/client-onboarding";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

import type { ContractingParty } from "@/lib/crm/contract-engine/types";
import { isMissingTableError, type OnboardingContext } from "./load-onboarding-context";

export type OnboardingAction =
  | "edit_draft"
  | "edit_cadastro"
  | "edit_faturamento"
  | "submit"
  | "review"
  | "return"
  | "conclude"
  | "submit_billing";

/** Etapas em que o cadastro já foi enviado e Operações Legais trabalha em paralelo ao lead. */
const AFTER_SUBMIT_STAGES = new Set<OpportunityStage>([
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
]);

/** Função ausente no banco (migration ainda não aplicada). */
function isMissingFunctionError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Cadastro (Operações Legais ou o responsável na devolução) e faturamento (o responsável) são
 * editados por pessoas diferentes: cada uma grava só a parte que pode mudar.
 */
function mergeSections(
  saved: ClientOnboardingPayload,
  input: ClientOnboardingPayload,
  allow: { cadastro: boolean; financeiro: boolean },
): ClientOnboardingPayload {
  const sources = { ...saved.sources };
  for (const [key, value] of Object.entries(input.sources)) {
    if ((allow.cadastro && key.startsWith("cadastro.")) || (allow.financeiro && key.startsWith("financeiro."))) {
      sources[key] = value;
    }
  }
  return {
    cadastro: allow.cadastro ? input.cadastro : saved.cadastro,
    financeiro: allow.financeiro ? input.financeiro : saved.financeiro,
    sources,
  };
}

function savedPayload(ctx: OnboardingContext): ClientOnboardingPayload {
  return ctx.row ? parseClientOnboardingPayload(ctx.row.payload) : ctx.payload;
}

/**
 * Avisos (sino + e-mail) depois da resposta: enviar/concluir/devolver não espera a lista de
 * destinatários nem o e-mail, e a ficha atualiza a etapa na hora. Fora de uma requisição, só dispara.
 */
function notifyAfterResponse(task: () => Promise<unknown>, scope: string, opportunityId: string): void {
  const run = () =>
    task().then(
      () => undefined,
      (error: unknown) => logServerError(scope, error, { opportunityId }),
    );
  try {
    after(run);
  } catch {
    void run();
  }
}

const MIGRATION_PENDING = new PublicError(
  "O cadastro do cliente ainda não foi habilitado no banco (migration pendente).",
  409,
  "MIGRATION_PENDING",
);

function leadOwnership(ctx: OnboardingContext) {
  return { createdByAppUserId: ctx.opportunity.criadoPor, requesterEmail: ctx.opportunity.solicitanteEmail };
}

/** Quem pode o quê no cadastro, pela mesma matriz de etapas (`stage-transition-rules`). */
export function evaluateOnboardingAction(
  actor: CrmActor,
  ctx: OnboardingContext,
  action: OnboardingAction,
): PolicyDecision {
  if (ctx.isRdLead) {
    return { allowed: false, code: "forbidden", reason: "Lead do RD é só leitura no CRM." };
  }
  if (ctx.rdMigrationPending && action !== "edit_draft") {
    return { allowed: false, code: "forbidden", reason: RD_MIGRATION_PENDING_MESSAGE };
  }
  const stage = ctx.opportunity.etapa;
  const lead = leadOwnership(ctx);
  const submitRule = () =>
    evaluateLeadAction(actor, {
      action: "stage.advance",
      from: "aguardando_cadastro",
      to: "cadastro_novo_cliente",
      lead,
      channel: "onboarding_submit",
    });
  // Operações Legais (e admin): mesma regra da devolução, que é do time.
  const opsRule = () =>
    evaluateLeadAction(actor, {
      action: "stage.advance",
      from: "cadastro_novo_cliente",
      to: "aguardando_cadastro",
      lead,
      channel: "onboarding_return",
    });
  const billingRule = () =>
    evaluateLeadAction(actor, {
      action: "stage.advance",
      from: "cadastro_novo_cliente",
      to: "inclusao_faturamento",
      lead,
      channel: "onboarding_billing",
    });
  const wrongStage: PolicyDecision = {
    allowed: false,
    code: "forbidden",
    reason: "O lead não está na etapa desta ação.",
  };
  // Depois do envio, Operações Legais confere em paralelo (não trava o lead): o responsável segue
  // para o faturamento quando tiver os dados e corrige o cadastro se ele for devolvido.
  const status = ctx.row?.status ?? null;
  const afterSubmit = AFTER_SUBMIT_STAGES.has(stage);

  switch (action) {
    case "edit_cadastro":
      if (stage === "aguardando_cadastro") return submitRule();
      // Com Operações Legais o cadastro não é editado: ela aponta o que está errado e devolve;
      // o responsável corrige e reenvia.
      if (afterSubmit && status === "devolvido") return submitRule();
      return {
        allowed: false,
        code: "forbidden",
        reason:
          status === "enviado"
            ? "O cadastro está com Operações Legais. Se algum dado estiver errado, ela devolve ao responsável."
            : "O cadastro não pode mais ser editado nesta etapa.",
      };
    case "edit_faturamento":
      if (stage === "aguardando_cadastro") return submitRule();
      if (stage === "cadastro_novo_cliente") return billingRule();
      return wrongStage;
    case "edit_draft": {
      const cadastro = evaluateOnboardingAction(actor, ctx, "edit_cadastro");
      return cadastro.allowed ? cadastro : evaluateOnboardingAction(actor, ctx, "edit_faturamento");
    }
    case "submit":
      if (stage === "aguardando_cadastro") return submitRule();
      return afterSubmit && status === "devolvido" ? submitRule() : wrongStage;
    case "review":
    case "conclude":
    case "return":
      return afterSubmit && status === "enviado" ? opsRule() : wrongStage;
    case "submit_billing":
      return stage === "cadastro_novo_cliente" && status !== "rascunho" && ctx.row ? billingRule() : wrongStage;
  }
}

function leadPath(opportunityId: string): string {
  return `/crm/leads/${encodeURIComponent(opportunityId)}?tab=onboarding`;
}

/** Salva o rascunho (sem mudar etapa). Concorrência otimista por `updated_at`. */
export async function saveOnboardingDraft(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; payload: ClientOnboardingPayload; expectedUpdatedAt?: string | null },
): Promise<{ updatedAt: string }> {
  const { ctx } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const now = new Date().toISOString();

  if (ctx.row) {
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== ctx.row.updated_at) {
      throw new PublicError("O cadastro foi alterado por outra pessoa. Atualize a tela.", 409, "ONBOARDING_CONFLICT");
    }
    const payload = mergeSections(savedPayload(ctx), input.payload, {
      cadastro: evaluateOnboardingAction(input.actor, ctx, "edit_cadastro").allowed,
      financeiro: evaluateOnboardingAction(input.actor, ctx, "edit_faturamento").allowed,
    });
    const { data, error } = await supabase
      .from("lead_client_onboarding")
      .update({ payload: payload as unknown as Json, updated_by: input.actor.appUserId, updated_at: now })
      .eq("id", ctx.row.id)
      .eq("updated_at", ctx.row.updated_at)
      .select("updated_at");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new PublicError("O cadastro foi alterado por outra pessoa. Atualize a tela.", 409, "ONBOARDING_CONFLICT");
    }
    return { updatedAt: (data[0] as { updated_at: string }).updated_at };
  }

  const { data, error } = await supabase
    .from("lead_client_onboarding")
    .insert({
      oportunidade_id: ctx.opportunity.id,
      status: "rascunho",
      payload: input.payload as unknown as Json,
      schema_version: CLIENT_ONBOARDING_SCHEMA_VERSION,
      updated_by: input.actor.appUserId,
    })
    .select("updated_at")
    .single();
  if (error) {
    if (isMissingTableError(error)) throw MIGRATION_PENDING;
    throw error;
  }
  return { updatedAt: (data as { updated_at: string }).updated_at };
}

/** Reenvio do cadastro devolvido: grava a correção e volta para Operações Legais, sem mudar a etapa. */
async function resubmitOnboardingRpc(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; payload: ClientOnboardingPayload },
): Promise<number> {
  const payload = mergeSections(savedPayload(input.ctx), input.payload, {
    cadastro: true,
    financeiro: evaluateOnboardingAction(input.actor, input.ctx, "edit_faturamento").allowed,
  });
  const { data, error } = await supabase.rpc("resubmit_client_onboarding_atomic", {
    p_opportunity_id: input.ctx.opportunity.id,
    p_actor: input.actor.appUserId,
    p_payload: payload as unknown as Json,
    p_now: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTableError(error)) {
      throw new PublicError(
        "O reenvio do cadastro ainda não foi habilitado no banco (migration 20261027120000 pendente).",
        409,
        "MIGRATION_PENDING",
      );
    }
    if (error.code === "40001") throw new PublicError("O cadastro mudou. Atualize a tela.", 409, "STAGE_CONFLICT");
    throw error;
  }
  return Number(data ?? 1);
}

/**
 * Envia para Operações Legais: valida o cadastro, grava e move para Cadastro de Novo Cliente.
 * Cadastro devolvido é reenviado sem mudar a etapa (o lead pode ter seguido para o faturamento).
 * Os dados do faturamento são pedidos depois, ao avançar para Inclusão no Faturamento.
 */
export async function submitOnboarding(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; payload: ClientOnboardingPayload },
): Promise<{ transitionId: string | null; stage: OpportunityStage }> {
  const { ctx, actor } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const missing = listMissingCadastroFields(input.payload);
  if (missing.length > 0) {
    throw new PublicError(`Preencha antes de enviar: ${missing.join(", ")}.`, 422, "ONBOARDING_INCOMPLETE");
  }

  const resubmit = ctx.opportunity.etapa !== "aguardando_cadastro";
  let transitionId: string | null = null;
  let submissionCount = 1;
  if (resubmit) {
    submissionCount = await resubmitOnboardingRpc(supabase, input);
  } else {
    const { data, error } = await supabase
      .rpc("submit_client_onboarding_atomic", {
        p_opportunity_id: ctx.opportunity.id,
        p_actor: actor.appUserId,
        p_payload: input.payload as unknown as Json,
        p_schema_version: CLIENT_ONBOARDING_SCHEMA_VERSION,
        p_now: new Date().toISOString(),
      })
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) throw MIGRATION_PENDING;
      if (error.code === "40001") {
        throw new PublicError("O lead mudou de etapa. Atualize a tela.", 409, "STAGE_CONFLICT");
      }
      throw error;
    }
    const row = data as { transition_id: string; submission_count: number } | null;
    transitionId = row?.transition_id ?? null;
    submissionCount = row?.submission_count ?? 1;
  }
  const row = { submission_count: submissionCount };
  const stage: OpportunityStage = resubmit ? ctx.opportunity.etapa : "cadastro_novo_cliente";

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "cadastro_cliente_enviado",
    title: resubmit
      ? "Cadastro do cliente corrigido e reenviado para Operações Legais"
      : "Cadastro do cliente enviado para Operações Legais",
    etapa: stage,
    actorAppUserId: actor.appUserId,
    sourceId: transitionId
      ? `onboarding-submit:${transitionId}`
      : `onboarding-resubmit:${ctx.opportunity.id}:${submissionCount}`,
  });
  if (transitionId) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: ctx.opportunity.id,
      kind: "etapa_alterada",
      title: "Etapa alterada",
      detail: "aguardando_cadastro → cadastro_novo_cliente",
      etapa: "cadastro_novo_cliente",
      actorAppUserId: actor.appUserId,
      sourceId: `trans:${transitionId}`,
      metadata: { from: "aguardando_cadastro", to: "cadastro_novo_cliente" },
    });
  }

  const leadName = ctx.opportunity.solicitanteNome ?? "Lead";
  notifyAfterResponse(async () => {
    const recipients = await notifyAudience(
      supabase,
      { modules: ["operacoes_legais"] },
      {
        tipo: "cadastro_cliente_pendente",
        title: `${resubmit ? "Cadastro corrigido" : "Cadastro de novo cliente"} — ${leadName}`,
        preview: resubmit
          ? `${input.payload.cadastro.razaoSocial}: o responsável ajustou o que foi apontado. Confira de novo e conclua.`
          : `${input.payload.cadastro.razaoSocial}: confira os dados, cadastre no VIOS e nos sistemas legados e defina o grupo.`,
        path: leadPath(ctx.opportunity.id),
        idempotencyKey: `cadastro-enviado:${ctx.opportunity.id}:${row?.submission_count ?? 1}`,
        extra: { oportunidade_id: ctx.opportunity.id },
      },
    );
    if (recipients.length === 0) {
      // Time ainda sem membros liberados: avisa os admins para não perder o pedido.
      await notifyAudience(
        supabase,
        { roles: ["admin"] },
        {
          tipo: "cadastro_cliente_pendente",
          title: `Cadastro de novo cliente — ${leadName}`,
          preview: "Nenhum usuário está no time Operações Legais (Configurações → Usuários). Libere o time ou conclua como admin.",
          path: leadPath(ctx.opportunity.id),
          idempotencyKey: `cadastro-enviado:${ctx.opportunity.id}:${row?.submission_count ?? 1}`,
          extra: { oportunidade_id: ctx.opportunity.id },
        },
      );
    }
  }, "onboarding/submit/notify", ctx.opportunity.id);

  return { transitionId, stage };
}

/**
 * Operações Legais devolve ao responsável apontando os campos a ajustar. O lead fica na etapa em
 * que está; sem a migration 20261027120000, usa a devolução antiga (volta para Aguardando Cadastro).
 */
export async function returnOnboarding(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; comment: string; ajustes: OnboardingAdjustment[] },
): Promise<{ transitionId: string | null; stage: OpportunityStage }> {
  const { ctx, actor } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const now = new Date().toISOString();
  const v2 = await supabase.rpc("return_client_onboarding_v2_atomic", {
    p_opportunity_id: ctx.opportunity.id,
    p_actor: actor.appUserId,
    p_comment: input.comment,
    p_ajustes: input.ajustes as unknown as Json,
    p_now: now,
  });
  let transitionId: string | null = null;
  let stage: OpportunityStage = ctx.opportunity.etapa;
  let error = v2.error;
  if (error && isMissingFunctionError(error) && ctx.opportunity.etapa === "cadastro_novo_cliente") {
    const legacy = await supabase.rpc("return_client_onboarding_atomic", {
      p_opportunity_id: ctx.opportunity.id,
      p_actor: actor.appUserId,
      p_comment: input.comment,
      p_now: now,
    });
    error = legacy.error;
    transitionId = (legacy.data as string | null) ?? null;
    stage = "aguardando_cadastro";
  }
  if (error) {
    if (isMissingTableError(error)) throw MIGRATION_PENDING;
    if (error.code === "40001") throw new PublicError("O cadastro mudou. Atualize a tela.", 409, "STAGE_CONFLICT");
    throw error;
  }

  const campos = input.ajustes
    .map((a) => adjustableFieldMeta(a.campo)?.label)
    .filter(Boolean)
    .join(", ");
  const detail = [campos ? `Ajustar: ${campos}` : "", input.comment].filter(Boolean).join(" · ");
  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "cadastro_cliente_devolvido",
    title: "Cadastro devolvido para ajuste",
    detail,
    etapa: stage,
    actorAppUserId: actor.appUserId,
    sourceId: transitionId ? `onboarding-return:${transitionId}` : `onboarding-return:${ctx.opportunity.id}:${now}`,
  });

  notifyAfterResponse(
    () =>
      notifyAudience(
        supabase,
        { leadOwnerOf: ctx.opportunity.id },
        {
          tipo: "cadastro_cliente_devolvido",
          title: `Cadastro devolvido — ${ctx.opportunity.solicitanteNome ?? "Lead"}`,
          preview: detail,
          path: leadPath(ctx.opportunity.id),
          idempotencyKey: `cadastro-devolvido:${transitionId ?? `${ctx.opportunity.id}:${now}`}`,
          extra: { oportunidade_id: ctx.opportunity.id },
        },
      ),
    "onboarding/return/notify",
    ctx.opportunity.id,
  );
  return { transitionId, stage };
}

/** Checklist de Operações Legais (salvo enquanto confere). */
export async function saveOpsChecklist(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; checklist: OpsChecklist },
): Promise<void> {
  const { ctx } = input;
  if (ctx.migrationPending || !ctx.row) throw MIGRATION_PENDING;
  const { error } = await supabase
    .from("lead_client_onboarding")
    .update({
      ops_checklist: input.checklist as unknown as Json,
      grupo_nome: input.checklist.grupoNome || null,
      vios_referencia: input.checklist.viosReferencia || null,
      updated_by: input.actor.appUserId,
    })
    .eq("id", ctx.row.id);
  if (error) throw error;
}

export type CarteiraMatch = {
  clientes: { id: string; razaoSocial: string; documento: string; grupoId: string | null; grupoNome: string | null; exact: boolean }[];
  grupos: { id: string; nome: string; exact: boolean }[];
};

/** Cliente pelo CPF/CNPJ (inclusive mesma raiz de CNPJ) e grupos pelo nome. */
export async function findCarteiraMatches(
  supabase: SupabaseClient,
  input: { documento: string; grupoNome: string },
): Promise<CarteiraMatch> {
  const digits = onlyDigits(input.documento);
  const root = digits.length === 14 ? digits.slice(0, 8) : null;
  const match: CarteiraMatch = { clientes: [], grupos: [] };

  if (digits.length >= 11) {
    // Documento pode estar gravado com ou sem máscara: busca pelos dois formatos.
    const prefix = root ?? digits.slice(0, 9);
    const formatted = root
      ? `${root.slice(0, 2)}.${root.slice(2, 5)}.${root.slice(5, 8)}`
      : `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}`;
    const { data } = await supabase
      .from("clientes")
      .select("id, razao_social, documento, grupo_id, grupos_economicos(nome)")
      .or(`documento.ilike.%${prefix}%,documento.ilike.%${formatted}%`)
      .limit(50);
    for (const row of (data ?? []) as {
      id: string;
      razao_social: string;
      documento: string;
      grupo_id: string | null;
      grupos_economicos: { nome: string } | { nome: string }[] | null;
    }[]) {
      const rowDigits = onlyDigits(row.documento ?? "");
      const exact = rowDigits === digits;
      if (!exact && !(root && rowDigits.startsWith(root))) continue;
      const grupo = Array.isArray(row.grupos_economicos) ? row.grupos_economicos[0] : row.grupos_economicos;
      match.clientes.push({
        id: row.id,
        razaoSocial: row.razao_social,
        documento: row.documento,
        grupoId: row.grupo_id,
        grupoNome: grupo?.nome ?? null,
        exact,
      });
    }
    match.clientes.sort((a, b) => Number(b.exact) - Number(a.exact));
  }

  const key = normalizeGroupKey(input.grupoNome);
  if (input.grupoNome.trim().length >= 2) {
    const term = input.grupoNome.trim().split(/\s+/)[0] ?? input.grupoNome.trim();
    const { data } = await supabase
      .from("grupos_economicos")
      .select("id, nome, chave_estavel")
      .ilike("nome", `%${term}%`)
      .order("nome")
      .limit(15);
    for (const row of (data ?? []) as { id: string; nome: string; chave_estavel: string }[]) {
      match.grupos.push({ id: row.id, nome: row.nome, exact: row.chave_estavel === key });
    }
    match.grupos.sort((a, b) => Number(b.exact) - Number(a.exact));
  }
  return match;
}

type OtherContratantesResult = { created: string[]; linked: string[]; conflicts: string[] };

/**
 * Demais contratantes do contrato (além do cliente principal) entram no mesmo grupo: as já
 * cadastradas sem grupo são vinculadas, as novas são criadas; quem está em outro grupo fica
 * de fora (vai no histórico para Operações Legais conferir).
 */
export async function linkOtherContratantesToGroup(
  supabase: SupabaseClient,
  input: { parties: ContractingParty[]; mainDocument: string; grupoId: string },
): Promise<OtherContratantesResult> {
  const result: OtherContratantesResult = { created: [], linked: [], conflicts: [] };
  const mainDoc = onlyDigits(input.mainDocument);
  const seen = new Set<string>([mainDoc]);
  for (const party of input.parties) {
    const doc = onlyDigits(party.documento);
    if (party.role !== "contratante" || seen.has(doc) || (doc.length !== 11 && doc.length !== 14)) continue;
    seen.add(doc);
    const nome = party.razaoSocial.trim() || party.documento;
    const { data: existing, error: findError } = await supabase
      .from("clientes")
      .select("id, grupo_id")
      .in("documento", [...new Set([party.documento.trim(), doc])])
      .order("created_at", { ascending: false })
      .limit(1);
    if (findError) throw findError;
    const found = existing?.[0] as { id: string; grupo_id: string | null } | undefined;
    if (found) {
      if (found.grupo_id && found.grupo_id !== input.grupoId) {
        result.conflicts.push(nome);
        continue;
      }
      if (!found.grupo_id) {
        const { error } = await supabase.from("clientes").update({ grupo_id: input.grupoId }).eq("id", found.id);
        if (error) throw error;
      }
      result.linked.push(nome);
      continue;
    }
    const e = party.endereco;
    const { error: insertError } = await supabase.from("clientes").insert({
      razao_social: nome,
      documento: party.documento.trim(),
      logradouro: e.logradouro || null,
      numero: e.numero || null,
      complemento: e.complemento || null,
      bairro: e.bairro || null,
      cidade: e.cidade || null,
      uf: e.uf || null,
      cep: onlyDigits(e.cep) || null,
      grupo_id: input.grupoId,
    });
    if (insertError) throw insertError;
    result.created.push(nome);
  }
  return result;
}

/**
 * Conclui o cadastro: cria/vincula grupo, cliente e contatos dos sócios e liga lead e contrato.
 * O lead fica em Cadastro de Novo Cliente até o responsável enviar os dados do faturamento
 * (`submitBilling`). Sem a migration 20261027120000, usa a conclusão antiga, que já leva o lead
 * para Inclusão no Faturamento.
 */
export async function concludeOnboarding(
  supabase: SupabaseClient,
  input: {
    ctx: OnboardingContext;
    actor: CrmActor;
    checklist: OpsChecklist;
    grupoId: string | null;
    clienteId: string | null;
  },
): Promise<{
  transitionId: string | null;
  clienteId: string;
  grupoId: string;
  contractId: string;
  stage: OpportunityStage;
}> {
  const { ctx, actor, checklist } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  // Com grupo existente escolhido, o nome vem do próprio grupo.
  const missingChecklist = listMissingChecklistItems(
    input.grupoId ? { ...checklist, grupoNome: checklist.grupoNome || "(grupo existente)" } : checklist,
  );
  if (missingChecklist.length > 0) {
    throw new PublicError(`Complete o checklist: ${missingChecklist.join(", ")}.`, 422, "CHECKLIST_INCOMPLETE");
  }
  const missing = listMissingCadastroFields(ctx.payload);
  if (missing.length > 0) {
    throw new PublicError(`Dados do cadastro incompletos: ${missing.join(", ")}.`, 422, "ONBOARDING_INCOMPLETE");
  }

  const { cadastro, financeiro } = ctx.payload;
  // Contato financeiro entra quando o responsável já informou (o faturamento pode vir antes).
  const contatos = [
    ...(financeiro.contatoFinanceiro.nome
      ? [
          {
            nome: financeiro.contatoFinanceiro.nome,
            cargo: financeiro.contatoFinanceiro.posicao,
            email: financeiro.contatoFinanceiro.email,
            telefone: financeiro.contatoFinanceiro.telefone,
            papel: "financeiro",
          },
        ]
      : []),
    ...cadastro.socios
      .filter((s) => s.nome)
      .map((s) => ({ nome: s.nome, cargo: s.posicao, email: "", telefone: "", papel: "socio" })),
  ];
  const args = {
    p_opportunity_id: ctx.opportunity.id,
    p_actor: actor.appUserId,
    p_checklist: checklist as unknown as Json,
    p_grupo_id: input.grupoId,
    p_grupo_nome: input.grupoId ? null : checklist.grupoNome,
    p_grupo_chave: input.grupoId ? null : normalizeGroupKey(checklist.grupoNome),
    p_cliente_id: input.clienteId,
    p_cliente: {
      razao_social: cadastro.razaoSocial,
      documento: cadastro.documento,
      logradouro: cadastro.endereco.logradouro,
      numero: cadastro.endereco.numero,
      complemento: cadastro.endereco.complemento,
      bairro: cadastro.endereco.bairro,
      cidade: cadastro.endereco.cidade,
      uf: cadastro.endereco.uf,
      cep: onlyDigits(cadastro.endereco.cep),
      email_principal: cadastro.email,
      telefone_principal: cadastro.telefone,
    } as unknown as Json,
    p_contatos: contatos as unknown as Json,
    p_vios_referencia: checklist.viosReferencia,
    p_now: new Date().toISOString(),
  };

  let result = await supabase.rpc("conclude_client_onboarding_v2_atomic", args).maybeSingle();
  let legacy = false;
  if (result.error && isMissingFunctionError(result.error)) {
    // Banco sem a migration: a conclusão antiga muda a etapa para Inclusão no Faturamento.
    legacy = true;
    result = await supabase.rpc("conclude_client_onboarding_atomic", args).maybeSingle();
  }
  const { data, error } = result;
  if (error) {
    if (isMissingTableError(error)) throw MIGRATION_PENDING;
    if (error.message?.includes("CLIENTE_GRUPO_CONFLICT")) {
      throw new PublicError(
        "Esse cliente já está em outro grupo econômico. Escolha esse grupo ou ajuste o cadastro.",
        409,
        "CLIENTE_GRUPO_CONFLICT",
      );
    }
    if (error.code === "40001") throw new PublicError("O cadastro mudou. Atualize a tela.", 409, "STAGE_CONFLICT");
    throw error;
  }
  const row = data as { transition_id?: string | null; cliente_id: string; grupo_id: string; contract_id: string };
  const transitionId = legacy ? (row.transition_id ?? null) : null;
  const stage: OpportunityStage = legacy ? "inclusao_faturamento" : ctx.opportunity.etapa;

  // As outras contratantes do contrato (ex.: PEC ao lado da LE BLOG) também viram clientes do grupo.
  let otherContratantes: OtherContratantesResult = { created: [], linked: [], conflicts: [] };
  try {
    otherContratantes = await linkOtherContratantesToGroup(supabase, {
      parties: ctx.contractParties ?? [],
      mainDocument: cadastro.documento,
      grupoId: row.grupo_id,
    });
  } catch (linkError) {
    logServerError("onboarding/conclude/other-contratantes", linkError, { opportunityId: ctx.opportunity.id });
  }

  // Origem comercial no grupo (colunas de migrations que podem não estar aplicadas).
  const { data: intake } = await supabase
    .from("lead_intakes")
    .select("*")
    .eq("oportunidade_id", ctx.opportunity.id)
    .maybeSingle();
  const i = (intake ?? {}) as Record<string, unknown>;
  const { error: grupoError } = await supabase
    .from("grupos_economicos")
    .update({
      categoria: "Cliente",
      tipo_lead: i.tipo_lead ?? null,
      tipo_indicacao: i.tipo_indicacao ?? null,
      nome_indicacao: i.nome_indicacao ?? null,
    } as never)
    .eq("id", row.grupo_id)
    .is("tipo_lead", null);
  if (grupoError && grupoError.code !== "42703" && grupoError.code !== "PGRST204") {
    logServerError("onboarding/conclude/grupo", grupoError);
  }

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "cadastro_cliente_concluido",
    title: "Cadastro do cliente concluído",
    detail: [
      `Grupo: ${checklist.grupoNome || "existente"} · VIOS: ${checklist.viosReferencia}`,
      otherContratantes.created.length + otherContratantes.linked.length > 0
        ? `Outras contratantes no grupo: ${[...otherContratantes.created, ...otherContratantes.linked].join(", ")}`
        : "",
      otherContratantes.conflicts.length > 0
        ? `Já em outro grupo (não vinculadas): ${otherContratantes.conflicts.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    etapa: stage,
    actorAppUserId: actor.appUserId,
    sourceId: `onboarding-conclude:${transitionId ?? ctx.opportunity.id}`,
    metadata: { cliente_id: row.cliente_id, grupo_id: row.grupo_id, contract_id: row.contract_id },
  });
  if (transitionId) {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: ctx.opportunity.id,
      kind: "etapa_alterada",
      title: "Etapa alterada",
      detail: "cadastro_novo_cliente → inclusao_faturamento",
      etapa: "inclusao_faturamento",
      actorAppUserId: actor.appUserId,
      sourceId: `trans:${transitionId}`,
      metadata: { from: "cadastro_novo_cliente", to: "inclusao_faturamento" },
    });
  }

  const leadName = ctx.opportunity.solicitanteNome ?? "Lead";
  // Ainda em Cadastro de Novo Cliente: o responsável segue para a etapa seguinte (faturamento).
  const awaitingBilling = !legacy && stage === "cadastro_novo_cliente";
  notifyAfterResponse(async () => {
    if (legacy) {
      await onEnteredInclusaoFaturamento(supabase, { opportunityId: ctx.opportunity.id, leadName });
    } else {
      await notifyAudience(
        supabase,
        { leadOwnerOf: ctx.opportunity.id },
        awaitingBilling
          ? {
              tipo: "faturamento_dados_pendentes",
              title: `Cadastro concluído — ${leadName}`,
              preview:
                "Operações Legais concluiu o cadastro. Siga para a etapa seguinte: envie os dados do faturamento para Inclusão no Faturamento.",
              path: leadPath(ctx.opportunity.id),
              idempotencyKey: `faturamento-dados:${ctx.opportunity.id}`,
              extra: { oportunidade_id: ctx.opportunity.id },
            }
          : {
              tipo: "cadastro_cliente_concluido",
              title: `Cadastro concluído — ${leadName}`,
              preview: "Operações Legais concluiu o cadastro do cliente.",
              path: leadPath(ctx.opportunity.id),
              idempotencyKey: `cadastro-concluido-responsavel:${ctx.opportunity.id}`,
              extra: { oportunidade_id: ctx.opportunity.id },
            },
      );
    }
    await notifyAudience(
      supabase,
      { leadTeamOf: ctx.opportunity.id },
      {
        tipo: "cadastro_cliente_concluido",
        title: `Cadastro concluído — ${leadName}`,
        preview: legacy
          ? "Operações Legais concluiu o cadastro. O contrato segue para o Financeiro."
          : awaitingBilling
            ? "Operações Legais concluiu o cadastro. Falta o responsável enviar os dados do faturamento."
            : "Operações Legais concluiu o cadastro do cliente.",
        path: `/crm/leads/${encodeURIComponent(ctx.opportunity.id)}`,
        idempotencyKey: `cadastro-concluido:${ctx.opportunity.id}`,
        extra: { oportunidade_id: ctx.opportunity.id },
      },
      { email: false },
    );
  }, "onboarding/conclude/notify", ctx.opportunity.id);

  return {
    transitionId,
    clienteId: row.cliente_id,
    grupoId: row.grupo_id,
    contractId: row.contract_id,
    stage,
  };
}

/**
 * O responsável envia os dados do faturamento em Cadastro de Novo Cliente, sem esperar
 * Operações Legais: grava o faturamento, cadastra o contato financeiro no cliente (se o cadastro
 * já o criou; senão entra na conclusão) e leva o lead para Inclusão no Faturamento.
 */
export async function submitBilling(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; payload: ClientOnboardingPayload },
): Promise<{ transitionId: string }> {
  const { ctx, actor } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const payload = mergeSections(savedPayload(ctx), input.payload, { cadastro: false, financeiro: true });
  const missing = listMissingFaturamentoFields(payload);
  if (missing.length > 0) {
    throw new PublicError(`Preencha antes de enviar: ${missing.join(", ")}.`, 422, "BILLING_INCOMPLETE");
  }

  const contato = payload.financeiro.contatoFinanceiro;
  const { data, error } = await supabase.rpc("submit_client_billing_atomic", {
    p_opportunity_id: ctx.opportunity.id,
    p_actor: actor.appUserId,
    p_payload: payload as unknown as Json,
    p_contato: { nome: contato.nome, cargo: contato.posicao, email: contato.email, telefone: contato.telefone },
    p_now: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTableError(error)) {
      throw new PublicError(
        "O envio dos dados do faturamento ainda não foi habilitado no banco (migration 20261027120000 pendente).",
        409,
        "MIGRATION_PENDING",
      );
    }
    if (error.code === "40001") throw new PublicError("O cadastro mudou. Atualize a tela.", 409, "STAGE_CONFLICT");
    throw error;
  }
  const transitionId = String(data);

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "faturamento_dados_enviados",
    title: "Dados do faturamento enviados ao Financeiro",
    etapa: "inclusao_faturamento",
    actorAppUserId: actor.appUserId,
    sourceId: `billing-submit:${transitionId}`,
  });
  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "etapa_alterada",
    title: "Etapa alterada",
    detail: "cadastro_novo_cliente → inclusao_faturamento",
    etapa: "inclusao_faturamento",
    actorAppUserId: actor.appUserId,
    sourceId: `trans:${transitionId}`,
    metadata: { from: "cadastro_novo_cliente", to: "inclusao_faturamento" },
  });

  notifyAfterResponse(
    () =>
      onEnteredInclusaoFaturamento(supabase, {
        opportunityId: ctx.opportunity.id,
        leadName: ctx.opportunity.solicitanteNome,
      }),
    "onboarding/billing/notify",
    ctx.opportunity.id,
  );
  return { transitionId };
}
