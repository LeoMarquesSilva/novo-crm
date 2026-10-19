import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateLeadAction, type CrmActor, type PolicyDecision } from "@/lib/auth/crm-access-policy";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { onEnteredInclusaoFaturamento } from "@/lib/crm/post-sale/on-enter-inclusao-faturamento";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { logServerError, PublicError } from "@/lib/http/api-errors";
import type { Json } from "@/lib/supabase/database.types";
import {
  CLIENT_ONBOARDING_SCHEMA_VERSION,
  listMissingChecklistItems,
  listMissingOnboardingFields,
  onlyDigits,
  type ClientOnboardingPayload,
  type OpsChecklist,
} from "@/modules/crm/domain/client-onboarding";

import { isMissingTableError, type OnboardingContext } from "./load-onboarding-context";

export type OnboardingAction = "edit_draft" | "submit" | "review" | "return" | "conclude";

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
  const concludeRule = () =>
    evaluateLeadAction(actor, {
      action: "stage.advance",
      from: "cadastro_novo_cliente",
      to: "inclusao_faturamento",
      lead,
      channel: "onboarding_conclude",
    });
  const wrongStage: PolicyDecision = {
    allowed: false,
    code: "forbidden",
    reason: "O lead não está na etapa desta ação.",
  };

  switch (action) {
    case "edit_draft":
      if (stage === "aguardando_cadastro") return submitRule();
      // Operações Legais pode corrigir dados durante a conferência.
      if (stage === "cadastro_novo_cliente") return concludeRule();
      return wrongStage;
    case "submit":
      return stage === "aguardando_cadastro" ? submitRule() : wrongStage;
    case "review":
    case "conclude":
      return stage === "cadastro_novo_cliente" ? concludeRule() : wrongStage;
    case "return":
      return stage === "cadastro_novo_cliente"
        ? evaluateLeadAction(actor, {
            action: "stage.advance",
            from: "cadastro_novo_cliente",
            to: "aguardando_cadastro",
            lead,
            channel: "onboarding_return",
          })
        : wrongStage;
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
    const { data, error } = await supabase
      .from("lead_client_onboarding")
      .update({ payload: input.payload as unknown as Json, updated_by: input.actor.appUserId, updated_at: now })
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

/** Envia para Operações Legais: valida, grava e move para Cadastro de Novo Cliente. */
export async function submitOnboarding(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; payload: ClientOnboardingPayload },
): Promise<{ transitionId: string | null }> {
  const { ctx, actor } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const missing = listMissingOnboardingFields(input.payload);
  if (missing.length > 0) {
    throw new PublicError(`Preencha antes de enviar: ${missing.join(", ")}.`, 422, "ONBOARDING_INCOMPLETE");
  }

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
  const transitionId = row?.transition_id ?? null;

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "cadastro_cliente_enviado",
    title: "Cadastro do cliente enviado para Operações Legais",
    etapa: "cadastro_novo_cliente",
    actorAppUserId: actor.appUserId,
    sourceId: transitionId ? `onboarding-submit:${transitionId}` : null,
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
  try {
    const recipients = await notifyAudience(
      supabase,
      { modules: ["operacoes_legais"] },
      {
        tipo: "cadastro_cliente_pendente",
        title: `Cadastro de novo cliente — ${leadName}`,
        preview: `${input.payload.cadastro.razaoSocial}: confira os dados, cadastre no VIOS e nos sistemas legados e defina o grupo.`,
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
  } catch (notifyError) {
    logServerError("onboarding/submit/notify", notifyError, { opportunityId: ctx.opportunity.id });
  }

  return { transitionId };
}

/** Operações Legais devolve ao responsável para ajuste (volta para Aguardando Cadastro). */
export async function returnOnboarding(
  supabase: SupabaseClient,
  input: { ctx: OnboardingContext; actor: CrmActor; comment: string },
): Promise<{ transitionId: string | null }> {
  const { ctx, actor } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  const { data, error } = await supabase.rpc("return_client_onboarding_atomic", {
    p_opportunity_id: ctx.opportunity.id,
    p_actor: actor.appUserId,
    p_comment: input.comment,
    p_now: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTableError(error)) throw MIGRATION_PENDING;
    if (error.code === "40001") throw new PublicError("O cadastro mudou. Atualize a tela.", 409, "STAGE_CONFLICT");
    throw error;
  }
  const transitionId = (data as string | null) ?? null;

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "cadastro_cliente_devolvido",
    title: "Cadastro devolvido para ajuste",
    detail: input.comment,
    etapa: "aguardando_cadastro",
    actorAppUserId: actor.appUserId,
    sourceId: transitionId ? `onboarding-return:${transitionId}` : null,
  });

  try {
    await notifyAudience(
      supabase,
      { leadOwnerOf: ctx.opportunity.id },
      {
        tipo: "cadastro_cliente_devolvido",
        title: `Cadastro devolvido — ${ctx.opportunity.solicitanteNome ?? "Lead"}`,
        preview: input.comment,
        path: leadPath(ctx.opportunity.id),
        idempotencyKey: `cadastro-devolvido:${transitionId ?? ctx.opportunity.id}`,
        extra: { oportunidade_id: ctx.opportunity.id },
      },
    );
  } catch (notifyError) {
    logServerError("onboarding/return/notify", notifyError, { opportunityId: ctx.opportunity.id });
  }
  return { transitionId };
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

/**
 * Conclui o cadastro: cria/vincula grupo, cliente e contatos, liga lead e contrato e move
 * para Inclusão no Faturamento (aviso ao Financeiro).
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
): Promise<{ transitionId: string | null; clienteId: string; grupoId: string; contractId: string }> {
  const { ctx, actor, checklist } = input;
  if (ctx.migrationPending) throw MIGRATION_PENDING;
  // Com grupo existente escolhido, o nome vem do próprio grupo.
  const missingChecklist = listMissingChecklistItems(
    input.grupoId ? { ...checklist, grupoNome: checklist.grupoNome || "(grupo existente)" } : checklist,
  );
  if (missingChecklist.length > 0) {
    throw new PublicError(`Complete o checklist: ${missingChecklist.join(", ")}.`, 422, "CHECKLIST_INCOMPLETE");
  }
  const missing = listMissingOnboardingFields(ctx.payload);
  if (missing.length > 0) {
    throw new PublicError(`Dados do cadastro incompletos: ${missing.join(", ")}.`, 422, "ONBOARDING_INCOMPLETE");
  }

  const { cadastro, financeiro } = ctx.payload;
  const contatos = [
    {
      nome: financeiro.contatoFinanceiro.nome,
      cargo: financeiro.contatoFinanceiro.posicao,
      email: financeiro.contatoFinanceiro.email,
      telefone: financeiro.contatoFinanceiro.telefone,
      papel: "financeiro",
    },
    ...cadastro.socios
      .filter((s) => s.nome)
      .map((s) => ({ nome: s.nome, cargo: s.posicao, email: "", telefone: "", papel: "socio" })),
  ];

  const { data, error } = await supabase
    .rpc("conclude_client_onboarding_atomic", {
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
    })
    .maybeSingle();
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
  const row = data as { transition_id: string; cliente_id: string; grupo_id: string; contract_id: string };

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
    detail: `Grupo: ${checklist.grupoNome || "existente"} · VIOS: ${checklist.viosReferencia}`,
    etapa: "inclusao_faturamento",
    actorAppUserId: actor.appUserId,
    sourceId: `onboarding-conclude:${row.transition_id}`,
    metadata: { cliente_id: row.cliente_id, grupo_id: row.grupo_id, contract_id: row.contract_id },
  });
  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "etapa_alterada",
    title: "Etapa alterada",
    detail: "cadastro_novo_cliente → inclusao_faturamento",
    etapa: "inclusao_faturamento",
    actorAppUserId: actor.appUserId,
    sourceId: `trans:${row.transition_id}`,
    metadata: { from: "cadastro_novo_cliente", to: "inclusao_faturamento" },
  });

  try {
    await onEnteredInclusaoFaturamento(supabase, {
      opportunityId: ctx.opportunity.id,
      leadName: ctx.opportunity.solicitanteNome,
    });
    await notifyAudience(
      supabase,
      { leadTeamOf: ctx.opportunity.id },
      {
        tipo: "cadastro_cliente_concluido",
        title: `Cadastro concluído — ${ctx.opportunity.solicitanteNome ?? "Lead"}`,
        preview: "Operações Legais concluiu o cadastro. O contrato segue para o Financeiro.",
        path: `/crm/leads/${encodeURIComponent(ctx.opportunity.id)}`,
        idempotencyKey: `cadastro-concluido:${ctx.opportunity.id}`,
        extra: { oportunidade_id: ctx.opportunity.id },
      },
      { email: false },
    );
  } catch (notifyError) {
    logServerError("onboarding/conclude/notify", notifyError, { opportunityId: ctx.opportunity.id });
  }

  return {
    transitionId: row.transition_id,
    clienteId: row.cliente_id,
    grupoId: row.grupo_id,
    contractId: row.contract_id,
  };
}
