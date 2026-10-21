import type { SupabaseClient } from "@supabase/supabase-js";

import { mapDbFieldToDefinition } from "@/lib/crm/compute-transition-requirements";
import type { FieldDefinition } from "@/lib/crm/crm-field-schema";
import { syncDueAreaTasksForOpportunity } from "@/lib/crm/due-area-tasks";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { displayStringToValueJson, valueJsonToDisplayString } from "@/lib/crm/pipeline-field-values";
import { onEnteredInclusaoFaturamento } from "@/lib/crm/post-sale/on-enter-inclusao-faturamento";
import { opportunityStageFromReconciliationDetails } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { logServerError, PublicError } from "@/lib/http/api-errors";
import type { Json } from "@/lib/supabase/database.types";
import { selectInChunks } from "@/lib/supabase/select-in-chunks";
import {
  CLIENT_ONBOARDING_SCHEMA_VERSION,
  parseClientOnboardingPayload,
} from "@/modules/crm/domain/client-onboarding";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

import {
  planRdMigration,
  resolveRdMigrationResponsible,
  type AppUserDirectoryEntry,
  type RdMigrationPlan,
  type RdMigrationResponsible,
} from "./plan";
import { findRdMigrationDuplicates } from "./duplicates";
import { buildRdMigrationPrefill } from "./prefill";
import { listRdFields, readRdDeal, type RdDealSnapshot } from "./rd-deal";
import { computeRdMigrationRequirements, type RdMigrationRequirements } from "./requirements";
import { rdMigrationTargetStage, resolveRdMigrationScope, type RdMigrationScope } from "./scope";
import { isMissingRdMigrationSchema, type RdMigrationStatus } from "./state";
import { mergeRdMigrationValues, parseRdMigrationValues, type RdMigrationValues } from "./values";

export const RD_MIGRATION_SCHEMA_PENDING = new PublicError(
  "A migração do RD ainda não foi habilitada no banco (migration 20261019120000 pendente).",
  409,
  "MIGRATION_PENDING",
);

export type RdMigrationActor = {
  appUserId: string;
  isAdmin: boolean;
  email: string | null;
};

type MigrationRow = {
  oportunidade_id: string;
  rd_deal_id: string;
  status: RdMigrationStatus;
  responsavel_app_user_id: string | null;
  payload: unknown;
  etapa_rd: string | null;
  etapa_destino: OpportunityStage | null;
  motivo_fora: string | null;
  convertida_em: string | null;
  concluida_em: string | null;
  updated_at: string;
};

type OpportunityRow = {
  id: string;
  etapa: OpportunityStage;
  encerramento: string | null;
  havera_due_diligence: boolean;
  solicitante_nome: string;
  solicitante_email: string | null;
  link_proposta: string | null;
  link_contrato: string | null;
  d4sign_document_uuid: string | null;
  venda_fechada_em?: string | null;
  rd_migrado_em?: string | null;
};

/** Tudo o que a fila e o formulário precisam de um negócio do RD. */
type MigrationContext = {
  opportunity: OpportunityRow;
  deal: RdDealSnapshot | null;
  rdDealId: string;
  row: MigrationRow | null;
  scope: RdMigrationScope;
  status: RdMigrationStatus;
  responsible: RdMigrationResponsible | null;
  values: RdMigrationValues;
  stage: OpportunityStage | null;
  requirements: RdMigrationRequirements | null;
  /** Mesmo cliente em outro negócio da fila (preenchido na leitura da fila inteira). */
  duplicate?: RdMigrationDuplicate | null;
};

export type RdMigrationDuplicate = {
  /** Sugestão: migrar este (já convertido ou na etapa mais adiantada) e tirar os outros. */
  suggested: boolean;
  reason: "documento" | "nome";
  others: Array<{ opportunityId: string; nome: string; stageLabel: string | null; status: RdMigrationStatus }>;
};

type SharedData = {
  users: AppUserDirectoryEntry[];
  fieldDefinitions: FieldDefinition[];
  fieldOptions: Record<string, string[] | null>;
};

// ── Leituras ──────────────────────────────────────────────────────────────────

/** Usuários do CRM com o e-mail de login (para casar o Solicitante do RD). */
export async function loadAppUserDirectory(supabase: SupabaseClient): Promise<AppUserDirectoryEntry[]> {
  const [{ data: users, error }, { data: authList, error: authError }] = await Promise.all([
    supabase.from("app_users").select("id, full_name, auth_user_id").order("full_name", { ascending: true }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (error) throw error;
  if (authError) throw authError;
  const emailByAuthId = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    if (u.id && u.email) emailByAuthId.set(u.id, u.email.trim().toLowerCase());
  }
  return ((users ?? []) as Array<{ id: string; full_name: string; auth_user_id: string | null }>).map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.auth_user_id ? (emailByAuthId.get(u.auth_user_id) ?? null) : null,
  }));
}

async function loadVendasFieldDefinitions(supabase: SupabaseClient): Promise<FieldDefinition[]> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity_name", "oportunidade")
    .eq("pipeline_code", "vendas")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapDbFieldToDefinition(row as Record<string, unknown>));
}

async function loadSharedData(supabase: SupabaseClient): Promise<SharedData> {
  const [users, allDefinitions] = await Promise.all([loadAppUserDirectory(supabase), loadVendasFieldDefinitions(supabase)]);
  const fieldDefinitions = allDefinitions.filter((d) => d.is_active !== false);
  const fieldOptions: Record<string, string[] | null> = {};
  for (const def of fieldDefinitions) {
    if (def.field_options?.length && !fieldOptions[def.field_code]) fieldOptions[def.field_code] = def.field_options;
  }
  return { users, fieldDefinitions, fieldOptions };
}

type ReconciliationRow = { oportunidade_id: string | null; reconciled_at: string; detalhes: unknown; rd_deal_id?: string };

async function loadReconciliations(
  supabase: SupabaseClient,
  opportunityId?: string,
): Promise<Map<string, ReconciliationRow>> {
  const out = new Map<string, ReconciliationRow>();
  const pageSize = 1000;
  for (let page = 0; page < 50; page += 1) {
    let query = supabase
      .from(opportunityId ? "rd_deal_reconciliacao" : "rd_deal_reconciliacao_resumo")
      .select(opportunityId ? "oportunidade_id, reconciled_at, detalhes, rd_deal_id" : "oportunidade_id, reconciled_at, detalhes")
      .not("oportunidade_id", "is", null);
    if (opportunityId) query = query.eq("oportunidade_id", opportunityId);
    const { data, error } = await query
      .order("reconciled_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) {
      // Sem a view (migration 20261016120000): lê a tabela.
      if (!opportunityId && page === 0 && (error.code === "42P01" || error.code === "PGRST205")) {
        return loadReconciliationsFromTable(supabase);
      }
      throw error;
    }
    for (const row of (data ?? []) as unknown as ReconciliationRow[]) {
      if (row.oportunidade_id && !out.has(row.oportunidade_id)) out.set(row.oportunidade_id, row);
    }
    if (!data || data.length < pageSize || opportunityId) break;
  }
  return out;
}

async function loadReconciliationsFromTable(supabase: SupabaseClient): Promise<Map<string, ReconciliationRow>> {
  const out = new Map<string, ReconciliationRow>();
  const { data, error } = await supabase
    .from("rd_deal_reconciliacao")
    .select("oportunidade_id, reconciled_at, detalhes, rd_deal_id")
    .not("oportunidade_id", "is", null)
    .order("reconciled_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as ReconciliationRow[]) {
    if (row.oportunidade_id && !out.has(row.oportunidade_id)) out.set(row.oportunidade_id, row);
  }
  return out;
}

async function loadMigrationRows(
  supabase: SupabaseClient,
  opportunityId?: string,
): Promise<{ rows: Map<string, MigrationRow>; schemaPending: boolean }> {
  let query = supabase
    .from("rd_migracoes")
    .select(
      "oportunidade_id, rd_deal_id, status, responsavel_app_user_id, payload, etapa_rd, etapa_destino, motivo_fora, convertida_em, concluida_em, updated_at",
    );
  if (opportunityId) query = query.eq("oportunidade_id", opportunityId);
  const { data, error } = await query;
  if (error) {
    if (isMissingRdMigrationSchema(error)) return { rows: new Map(), schemaPending: true };
    throw error;
  }
  return {
    rows: new Map(((data ?? []) as MigrationRow[]).map((r) => [r.oportunidade_id, r])),
    schemaPending: false,
  };
}

/** Dados que, depois da conversão, vivem no CRM: investimento da proposta e cadastro do cliente. */
async function loadConvertedOverlay(
  supabase: SupabaseClient,
  opportunityIds: string[],
  fieldDefinitions: FieldDefinition[],
): Promise<Map<string, { escopoJson: string | null; onboarding: unknown | null }>> {
  const out = new Map<string, { escopoJson: string | null; onboarding: unknown | null }>();
  if (opportunityIds.length === 0) return out;
  const escopoDefIds = fieldDefinitions.filter((d) => d.field_code === "cp_escopo_detalhe_json").map((d) => d.id);
  const [values, onboarding] = await Promise.all([
    escopoDefIds.length
      ? selectInChunks(opportunityIds, (chunk) =>
          supabase
            .from("field_values")
            .select("entity_record_id, value_json, updated_at")
            .eq("entity_name", "oportunidade")
            .in("field_definition_id", escopoDefIds)
            .in("entity_record_id", chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    selectInChunks(opportunityIds, (chunk) =>
      supabase.from("lead_client_onboarding").select("oportunidade_id, payload").in("oportunidade_id", chunk),
    ),
  ]);
  for (const id of opportunityIds) out.set(id, { escopoJson: null, onboarding: null });
  for (const row of (values.data ?? []) as Array<{ entity_record_id: string; value_json: unknown }>) {
    const entry = out.get(row.entity_record_id);
    if (entry) entry.escopoJson = valueJsonToDisplayString(row.value_json) || null;
  }
  if (!onboarding.error) {
    for (const row of (onboarding.data ?? []) as Array<{ oportunidade_id: string; payload: unknown }>) {
      const entry = out.get(row.oportunidade_id);
      if (entry) entry.onboarding = row.payload;
    }
  }
  return out;
}

function buildContext(input: {
  opportunity: OpportunityRow;
  reconciliation: ReconciliationRow | undefined;
  row: MigrationRow | null;
  shared: SharedData;
  overlay?: { escopoJson: string | null; onboarding: unknown | null };
}): MigrationContext {
  const { opportunity, row, shared } = input;
  const deal = readRdDeal(input.reconciliation?.detalhes);
  const rdDealId = row?.rd_deal_id ?? input.reconciliation?.rd_deal_id ?? deal?.id ?? "";
  const converted = Boolean(opportunity.rd_migrado_em);
  const scope = resolveRdMigrationScope({
    deal,
    dbStage: converted
      ? (opportunityStageFromReconciliationDetails(input.reconciliation?.detalhes) ?? opportunity.etapa)
      : opportunity.etapa,
    encerramento: converted ? null : opportunity.encerramento,
    haveraDueDiligence: opportunity.havera_due_diligence,
  });
  const status: RdMigrationStatus = row?.status ?? "pendente";
  const responsible = resolveRdMigrationResponsible({
    deal,
    assignedAppUserId: row?.responsavel_app_user_id ?? null,
    users: shared.users,
  });

  const prefill = deal
    ? buildRdMigrationPrefill({
        deal,
        opportunity: {
          nome: opportunity.solicitante_nome,
          haveraDueDiligence: opportunity.havera_due_diligence,
          linkProposta: opportunity.link_proposta,
          linkContrato: opportunity.link_contrato,
          d4signDocumentUuid: opportunity.d4sign_document_uuid,
        },
        users: shared.users,
        fieldOptions: shared.fieldOptions,
      })
    : parseRdMigrationValues({});
  let values = mergeRdMigrationValues(prefill, row?.payload);
  if (converted && input.overlay) {
    if (input.overlay.escopoJson) values = { ...values, campos: { ...values.campos, cp_escopo_detalhe_json: input.overlay.escopoJson } };
    if (input.overlay.onboarding) values = { ...values, onboarding: parseClientOnboardingPayload(input.overlay.onboarding) };
  }

  const stage: OpportunityStage | null = converted
    ? opportunity.etapa
    : scope.inScope
      ? rdMigrationTargetStage(scope.rdStage, values.cadastro.dueDiligence === "Sim")
      : null;
  const requirements = stage
    ? computeRdMigrationRequirements({
        stage,
        values,
        fieldDefinitions: shared.fieldDefinitions,
        responsibleAppUserId: responsible?.appUserId ?? null,
      })
    : null;

  return { opportunity, deal, rdDealId, row, scope, status, responsible, values, stage, requirements };
}

// ── Fila ──────────────────────────────────────────────────────────────────────

export type RdMigrationQueueItem = {
  opportunityId: string;
  rdDealId: string;
  nome: string;
  rdStageLabel: string | null;
  stage: OpportunityStage | null;
  stageLabel: string | null;
  status: RdMigrationStatus;
  responsible: { appUserId: string; fullName: string; origem: RdMigrationResponsible["origem"] } | null;
  missingCount: number;
  missingBeforeConversion: number;
  readyForConversion: boolean;
  complete: boolean;
  rdUpdatedAt: string | null;
  motivoFora: string | null;
  duplicate: RdMigrationDuplicate | null;
};

export type RdViradaState = {
  congeladoEm: string | null;
  convertidoEm: string | null;
  ultimoResumo: Record<string, unknown>;
};

export type RdMigrationQueue = {
  items: RdMigrationQueueItem[];
  virada: RdViradaState;
  schemaPending: boolean;
  users: Array<{ id: string; fullName: string }>;
};

export async function loadRdViradaState(supabase: SupabaseClient): Promise<RdViradaState & { schemaPending: boolean }> {
  const { data, error } = await supabase
    .from("rd_virada")
    .select("congelado_em, convertido_em, ultimo_resumo")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    if (isMissingRdMigrationSchema(error)) {
      return { congeladoEm: null, convertidoEm: null, ultimoResumo: {}, schemaPending: true };
    }
    throw error;
  }
  const row = data as { congelado_em: string | null; convertido_em: string | null; ultimo_resumo: unknown } | null;
  return {
    congeladoEm: row?.congelado_em ?? null,
    convertidoEm: row?.convertido_em ?? null,
    ultimoResumo:
      row?.ultimo_resumo && typeof row.ultimo_resumo === "object" ? (row.ultimo_resumo as Record<string, unknown>) : {},
    schemaPending: false,
  };
}

async function loadAllContexts(supabase: SupabaseClient): Promise<{
  contexts: MigrationContext[];
  schemaPending: boolean;
  shared: SharedData;
}> {
  const [reconciliations, migration, shared] = await Promise.all([
    loadReconciliations(supabase),
    loadMigrationRows(supabase),
    loadSharedData(supabase),
  ]);
  const ids = [...reconciliations.keys()];
  const { data: opps, error } = await selectInChunks(ids, (chunk) =>
    supabase.from("oportunidades").select("*").in("id", chunk),
  );
  if (error) throw error;
  const opportunities = (opps ?? []) as OpportunityRow[];
  const convertedIds = opportunities.filter((o) => o.rd_migrado_em).map((o) => o.id);
  const overlay = await loadConvertedOverlay(supabase, convertedIds, shared.fieldDefinitions);

  const contexts: MigrationContext[] = [];
  for (const opportunity of opportunities) {
    const row = migration.rows.get(opportunity.id) ?? null;
    const ctx = buildContext({
      opportunity,
      reconciliation: reconciliations.get(opportunity.id),
      row,
      shared,
      overlay: overlay.get(opportunity.id),
    });
    // Fora do escopo e nunca tocado pela migração: não aparece na fila.
    if (!ctx.scope.inScope && !row && !opportunity.rd_migrado_em) continue;
    contexts.push(ctx);
  }
  annotateDuplicates(contexts);
  return { contexts, schemaPending: migration.schemaPending, shared };
}

/** Marca negócios do mesmo cliente (CPF/CNPJ ou nome) que ainda estão na migração. */
function annotateDuplicates(contexts: MigrationContext[]): void {
  const active = contexts.filter((c) => c.status !== "fora" && (c.scope.inScope || c.opportunity.rd_migrado_em));
  const byId = new Map(active.map((c) => [c.opportunity.id, c]));
  const found = findRdMigrationDuplicates(
    active.map((c) => ({
      opportunityId: c.opportunity.id,
      nome: c.opportunity.solicitante_nome,
      documentos: c.values.cadastro.empresas.map((e) => e.documento.replace(/\D/g, "")).filter(Boolean),
      stage: c.stage,
      converted: Boolean(c.opportunity.rd_migrado_em),
    })),
  );
  for (const ctx of contexts) {
    const info = found.get(ctx.opportunity.id);
    ctx.duplicate = info
      ? {
          suggested: info.suggested,
          reason: info.reason,
          others: info.others.map((id) => {
            const other = byId.get(id)!;
            return {
              opportunityId: id,
              nome: other.opportunity.solicitante_nome,
              stageLabel: other.stage ? OPPORTUNITY_STAGE_LABELS[other.stage] : null,
              status: other.status,
            };
          }),
        }
      : null;
  }
}

function toQueueItem(ctx: MigrationContext): RdMigrationQueueItem {
  return {
    opportunityId: ctx.opportunity.id,
    rdDealId: ctx.rdDealId,
    nome: ctx.opportunity.solicitante_nome,
    rdStageLabel: ctx.deal?.stageLabel ?? ctx.row?.etapa_rd ?? null,
    stage: ctx.stage,
    stageLabel: ctx.stage ? OPPORTUNITY_STAGE_LABELS[ctx.stage] : null,
    status: ctx.status,
    responsible: ctx.responsible
      ? { appUserId: ctx.responsible.appUserId, fullName: ctx.responsible.fullName, origem: ctx.responsible.origem }
      : null,
    missingCount: ctx.requirements?.missing.length ?? 0,
    missingBeforeConversion: ctx.requirements?.missingBeforeConversion.length ?? 0,
    readyForConversion: ctx.requirements?.readyForConversion ?? false,
    complete: ctx.requirements?.complete ?? false,
    rdUpdatedAt: ctx.deal?.updatedAt ?? null,
    motivoFora: ctx.row?.motivo_fora ?? null,
    duplicate: ctx.duplicate ?? null,
  };
}

/** Fila "Migrar do RD": admin vê tudo; os demais, só os negócios de que são responsáveis. */
export async function loadRdMigrationQueue(
  supabase: SupabaseClient,
  actor: RdMigrationActor,
): Promise<RdMigrationQueue> {
  const [{ contexts, schemaPending, shared }, virada] = await Promise.all([
    loadAllContexts(supabase),
    loadRdViradaState(supabase),
  ]);
  const visible = actor.isAdmin ? contexts : contexts.filter((c) => c.responsible?.appUserId === actor.appUserId);
  return {
    items: visible.map(toQueueItem).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    virada: { congeladoEm: virada.congeladoEm, convertidoEm: virada.convertidoEm, ultimoResumo: virada.ultimoResumo },
    schemaPending: schemaPending || virada.schemaPending,
    users: shared.users.map((u) => ({ id: u.id, fullName: u.fullName })),
  };
}

// ── Formulário de um negócio ──────────────────────────────────────────────────

async function loadContext(
  supabase: SupabaseClient,
  opportunityId: string,
  shared?: SharedData,
): Promise<{ ctx: MigrationContext; schemaPending: boolean; shared: SharedData }> {
  const [{ data: opp, error }, reconciliations, migration, sharedData] = await Promise.all([
    supabase.from("oportunidades").select("*").eq("id", opportunityId).maybeSingle(),
    loadReconciliations(supabase, opportunityId),
    loadMigrationRows(supabase, opportunityId),
    shared ? Promise.resolve(shared) : loadSharedData(supabase),
  ]);
  if (error) throw error;
  if (!opp) throw new PublicError("Lead não encontrado.", 404, "NOT_FOUND");
  const reconciliation = reconciliations.get(opportunityId);
  if (!reconciliation) throw new PublicError("Este lead não veio do RD.", 404, "NOT_RD_LEAD");
  const opportunity = opp as OpportunityRow;
  const overlay = opportunity.rd_migrado_em
    ? (await loadConvertedOverlay(supabase, [opportunityId], sharedData.fieldDefinitions)).get(opportunityId)
    : undefined;
  const ctx = buildContext({
    opportunity,
    reconciliation,
    row: migration.rows.get(opportunityId) ?? null,
    shared: sharedData,
    overlay,
  });
  return { ctx, schemaPending: migration.schemaPending, shared: sharedData };
}

export type RdMigrationDetail = {
  opportunityId: string;
  rdDealId: string;
  rdDealUrl: string | null;
  nome: string;
  status: RdMigrationStatus;
  converted: boolean;
  rdStageLabel: string | null;
  stage: OpportunityStage | null;
  stageLabel: string | null;
  outOfScopeReason: string | null;
  responsible: RdMigrationQueueItem["responsible"];
  canEdit: boolean;
  isAdmin: boolean;
  values: RdMigrationValues;
  requirements: RdMigrationRequirements | null;
  /** Campo Gestor do Contrato (bloco da proposta usa o select de usuários). */
  gestorField: FieldDefinition | null;
  rdFields: Array<{ label: string; value: string }>;
  rdUpdatedAt: string | null;
  updatedAt: string | null;
  motivoFora: string | null;
  schemaPending: boolean;
  frozen: boolean;
  users: Array<{ id: string; fullName: string }>;
  duplicate: RdMigrationDuplicate | null;
};

function canEditMigration(ctx: MigrationContext, actor: RdMigrationActor): boolean {
  if (ctx.status === "fora" || ctx.status === "concluida") return false;
  return actor.isAdmin || ctx.responsible?.appUserId === actor.appUserId;
}

function canViewMigration(ctx: MigrationContext, actor: RdMigrationActor): boolean {
  return actor.isAdmin || ctx.responsible?.appUserId === actor.appUserId;
}

const OUT_OF_SCOPE_LABELS: Record<string, string> = {
  sem_etapa: "O RD não informa a etapa deste negócio.",
  etapa_fora: "A etapa do RD fica fora da migração (Boas-vindas, Kick-off, Execução do Serviço ou funil de contato).",
  perdido: "Negócio perdido no RD.",
};

function toDetail(
  ctx: MigrationContext,
  actor: RdMigrationActor,
  shared: SharedData,
  extra: { schemaPending: boolean; frozen: boolean },
): RdMigrationDetail {
  const item = toQueueItem(ctx);
  return {
    opportunityId: ctx.opportunity.id,
    rdDealId: ctx.rdDealId,
    rdDealUrl:
      ctx.rdDealId && !ctx.rdDealId.startsWith("lead_")
        ? `https://crm.rdstation.com/deals/${encodeURIComponent(ctx.rdDealId)}`
        : null,
    nome: ctx.opportunity.solicitante_nome,
    status: ctx.status,
    converted: Boolean(ctx.opportunity.rd_migrado_em),
    rdStageLabel: item.rdStageLabel,
    stage: ctx.stage,
    stageLabel: item.stageLabel,
    outOfScopeReason: ctx.scope.inScope || ctx.opportunity.rd_migrado_em ? null : OUT_OF_SCOPE_LABELS[ctx.scope.reason],
    responsible: item.responsible,
    canEdit: canEditMigration(ctx, actor) && !extra.schemaPending && Boolean(ctx.stage),
    isAdmin: actor.isAdmin,
    values: ctx.values,
    requirements: ctx.requirements,
    gestorField: shared.fieldDefinitions.find((d) => d.field_code === "cp_gestor_contrato") ?? null,
    rdFields: ctx.deal ? listRdFields(ctx.deal) : [],
    rdUpdatedAt: ctx.deal?.updatedAt ?? null,
    updatedAt: ctx.row?.updated_at ?? null,
    motivoFora: ctx.row?.motivo_fora ?? null,
    schemaPending: extra.schemaPending,
    frozen: extra.frozen,
    users: shared.users.map((u) => ({ id: u.id, fullName: u.fullName })),
    duplicate: ctx.duplicate ?? null,
  };
}

export async function loadRdMigrationDetail(
  supabase: SupabaseClient,
  opportunityId: string,
  actor: RdMigrationActor,
): Promise<RdMigrationDetail> {
  const [{ ctx, schemaPending, shared }, virada, all] = await Promise.all([
    loadContext(supabase, opportunityId),
    loadRdViradaState(supabase),
    // Duplicados dependem da fila inteira (mesmo CPF/CNPJ ou nome em outro negócio).
    loadAllContexts(supabase),
  ]);
  if (!canViewMigration(ctx, actor)) {
    throw new PublicError("Só o responsável pelo lead e o admin veem esta migração.", 403, "FORBIDDEN");
  }
  ctx.duplicate = all.contexts.find((c) => c.opportunity.id === opportunityId)?.duplicate ?? null;
  return toDetail(ctx, actor, shared, { schemaPending: schemaPending || virada.schemaPending, frozen: Boolean(virada.congeladoEm) });
}

// ── Gravação ──────────────────────────────────────────────────────────────────

const INTAKE_OPTIONAL_COLUMNS = ["plataforma", "area_cross_selling", "decisor"] as const;

function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function upsertIntake(supabase: SupabaseClient, plan: RdMigrationPlan): Promise<string[]> {
  const warnings: string[] = [];
  const { data: existing, error: lookupError } = await supabase
    .from("lead_intakes")
    .select("id")
    .eq("oportunidade_id", plan.intake.oportunidade_id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const write = async (row: Record<string, unknown>) =>
    existing
      ? supabase.from("lead_intakes").update(row as never).eq("id", (existing as { id: string }).id)
      : supabase.from("lead_intakes").insert(row as never);

  let row: Record<string, unknown> = { ...plan.intake };
  let { error } = await write(row);
  if (error && isMissingColumn(error)) {
    // Migration 20261008183000 (Plataforma, Área do cross selling, Decisor) ainda não aplicada.
    row = Object.fromEntries(Object.entries(row).filter(([k]) => !(INTAKE_OPTIONAL_COLUMNS as readonly string[]).includes(k)));
    ({ error } = await write(row));
    if (!error && INTAKE_OPTIONAL_COLUMNS.some((k) => plan.intake[k])) {
      warnings.push("Plataforma, área do cross selling e decisor não foram gravados (migration 20261008183000 pendente).");
    }
  }
  if (error) throw error;
  return warnings;
}

async function upsertFieldValues(
  supabase: SupabaseClient,
  plan: RdMigrationPlan,
  definitions: FieldDefinition[],
  actorAppUserId: string,
): Promise<string[]> {
  if (plan.fieldValues.length === 0) return [];
  const opportunityId = plan.intake.oportunidade_id;
  const byCode = new Map<string, FieldDefinition>();
  for (const def of definitions) {
    const current = byCode.get(def.field_code);
    if (!current || (current.is_active === false && def.is_active !== false)) byCode.set(def.field_code, def);
  }
  const { data: existingRows, error } = await supabase
    .from("field_values")
    .select("id, field_definition_id, updated_at")
    .eq("entity_name", "oportunidade")
    .eq("entity_record_id", opportunityId)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const existingByDef = new Map<string, string>();
  for (const row of (existingRows ?? []) as Array<{ id: string; field_definition_id: string }>) {
    if (!existingByDef.has(row.field_definition_id)) existingByDef.set(row.field_definition_id, row.id);
  }

  const now = new Date().toISOString();
  const skipped: string[] = [];
  for (const { code, value } of plan.fieldValues) {
    const def = byCode.get(code);
    if (!def) {
      skipped.push(code);
      continue;
    }
    const valueJson = Array.isArray(value) ? value : displayStringToValueJson(def.field_type, value);
    const existingId = existingByDef.get(def.id);
    const result = existingId
      ? await supabase
          .from("field_values")
          .update({ value_json: valueJson as Json, updated_at: now, updated_by: actorAppUserId })
          .eq("id", existingId)
      : await supabase.from("field_values").insert({
          entity_name: "oportunidade",
          entity_record_id: opportunityId,
          field_definition_id: def.id,
          value_json: valueJson as Json,
          updated_at: now,
          updated_by: actorAppUserId,
        });
    if (result.error) throw result.error;
  }
  return skipped.length ? [`Campos sem definição no banco, não gravados: ${skipped.join(", ")}.`] : [];
}

async function linkD4SignDocument(supabase: SupabaseClient, opportunityId: string, uuid: string): Promise<string[]> {
  const { data: doc, error } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, oportunidade_id, d4sign_status")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  if (error) throw error;
  const row = doc as { uuid_doc: string; oportunidade_id: string | null; d4sign_status: string | null } | null;
  if (!row) return ["Documento da D4Sign não encontrado no catálogo; vínculo não gravado."];
  if (row.oportunidade_id && row.oportunidade_id !== opportunityId) {
    return ["O documento da D4Sign já está vinculado a outro lead; vínculo não alterado."];
  }
  const now = new Date().toISOString();
  const { error: linkError } = await supabase
    .from("d4sign_documents")
    .update({ oportunidade_id: opportunityId, updated_at: now })
    .eq("uuid_doc", uuid);
  if (linkError) throw linkError;
  await supabase
    .from("oportunidades")
    .update({ d4sign_status: row.d4sign_status, d4sign_updated_at: now })
    .eq("id", opportunityId);
  return [];
}

async function writeOnboarding(
  supabase: SupabaseClient,
  plan: RdMigrationPlan,
  input: { actorAppUserId: string; clienteId: string | null; now: string },
): Promise<void> {
  if (!plan.onboarding) return;
  const opportunityId = plan.intake.oportunidade_id;
  const { data: existing, error } = await supabase
    .from("lead_client_onboarding")
    .select("id, status")
    .eq("oportunidade_id", opportunityId)
    .maybeSingle();
  if (error) {
    if (isMissingRdMigrationSchema(error)) return; // cadastro do pós-venda ainda sem migration
    throw error;
  }
  const current = existing as { id: string; status: string } | null;
  // Cadastro já com Ops Legais/concluído, ou rascunho de Aguardando Cadastro em uso na aba: não sobrescreve.
  if (current && !["rascunho", "devolvido"].includes(current.status)) return;
  if (current && plan.mode === "update" && plan.targetStage === "aguardando_cadastro") return;

  const status = plan.onboarding.status;
  const row: Record<string, unknown> = {
    status,
    payload: plan.onboarding.payload as unknown as Json,
    schema_version: CLIENT_ONBOARDING_SCHEMA_VERSION,
    updated_by: input.actorAppUserId,
    updated_at: input.now,
  };
  if (status === "enviado" || status === "concluido") {
    row.submitted_payload = plan.onboarding.payload as unknown as Json;
    row.submitted_at = input.now;
    row.submitted_by = input.actorAppUserId;
    row.submission_count = 1;
  }
  if (status === "concluido") {
    row.concluded_at = input.now;
    row.concluded_by = input.actorAppUserId;
    row.cliente_id = input.clienteId;
    row.ops_checklist = { observacoes: "Cadastro feito no processo do RD Station (migração da virada)." };
  }
  const result = current
    ? await supabase.from("lead_client_onboarding").update(row as never).eq("id", current.id)
    : await supabase.from("lead_client_onboarding").insert({ oportunidade_id: opportunityId, ...row } as never);
  if (result.error) throw result.error;
}

async function ensureContractDraft(
  supabase: SupabaseClient,
  plan: RdMigrationPlan,
  now: string,
): Promise<void> {
  if (!plan.contract.ensureDraft) return;
  const opportunityId = plan.intake.oportunidade_id;
  const { error } = await supabase.rpc("ensure_contract_draft_for_opportunity", {
    p_opportunity_id: opportunityId,
    p_now: now,
  });
  if (error) throw error;
  if (plan.contract.dataAssinatura) {
    await supabase
      .from("contratos")
      .update({ data_assinatura: plan.contract.dataAssinatura })
      .eq("oportunidade_id", opportunityId)
      .is("data_assinatura", null);
  }
}

/** Aplica o plano. Idempotente: rodar de novo regrava os mesmos valores. */
async function applyPlan(
  supabase: SupabaseClient,
  plan: RdMigrationPlan,
  input: {
    definitions: FieldDefinition[];
    actorAppUserId: string;
    leadName: string;
    clienteId: string | null;
    notify: boolean;
  },
): Promise<string[]> {
  const now = new Date().toISOString();
  const opportunityId = plan.intake.oportunidade_id;
  const warnings: string[] = [];

  warnings.push(...(await upsertIntake(supabase, plan)));
  warnings.push(...(await upsertFieldValues(supabase, plan, input.definitions, input.actorAppUserId)));

  const { error: oppError } = await supabase
    .from("oportunidades")
    .update(plan.opportunityUpdate as never)
    .eq("id", opportunityId);
  if (oppError) {
    if (isMissingColumn(oppError) && plan.mode === "convert") throw RD_MIGRATION_SCHEMA_PENDING;
    throw oppError;
  }

  if (plan.mode === "convert" && plan.fromStage !== plan.targetStage) {
    await supabase.from("transicoes_etapa").insert({
      oportunidade_id: opportunityId,
      etapa_origem: plan.fromStage,
      etapa_destino: plan.targetStage,
      alterado_por: input.actorAppUserId,
      observacao: "Migração do RD Station (virada)",
    });
  }

  if (plan.d4signDocumentUuid) warnings.push(...(await linkD4SignDocument(supabase, opportunityId, plan.d4signDocumentUuid)));
  await ensureContractDraft(supabase, plan, now);
  await writeOnboarding(supabase, plan, { actorAppUserId: input.actorAppUserId, clienteId: input.clienteId, now });

  if (plan.syncDueTasks) {
    try {
      await syncDueAreaTasksForOpportunity(supabase, opportunityId);
    } catch (error) {
      logServerError("rd-migration/due-tasks", error, { opportunityId });
      warnings.push("As tarefas da DUE não foram criadas; confira na aba DUE.");
    }
  }
  if (plan.enteredInclusaoFaturamento) {
    await onEnteredInclusaoFaturamento(supabase, { opportunityId, leadName: input.leadName, notify: input.notify });
  }
  return warnings;
}

async function upsertMigrationRow(
  supabase: SupabaseClient,
  ctx: MigrationContext,
  patch: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
): Promise<void> {
  if (ctx.row) {
    let query = supabase.from("rd_migracoes").update(patch as never).eq("oportunidade_id", ctx.opportunity.id);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    const { data, error } = await query.select("oportunidade_id");
    if (error) throw error;
    if (expectedUpdatedAt && (!data || data.length === 0)) {
      throw new PublicError("A migração foi alterada por outra pessoa. Atualize a tela.", 409, "MIGRATION_CONFLICT");
    }
    return;
  }
  const { error } = await supabase.from("rd_migracoes").insert({
    oportunidade_id: ctx.opportunity.id,
    rd_deal_id: ctx.rdDealId || ctx.opportunity.id,
    etapa_rd: ctx.deal?.stageLabel ?? null,
    ...patch,
  } as never);
  if (error) {
    if (isMissingRdMigrationSchema(error)) throw RD_MIGRATION_SCHEMA_PENDING;
    throw error;
  }
}

async function markConcluded(
  supabase: SupabaseClient,
  ctx: MigrationContext,
  actorAppUserId: string,
  now: string,
): Promise<void> {
  await recordLeadActivityEvent(supabase, {
    oportunidadeId: ctx.opportunity.id,
    kind: "rd_migracao_concluida",
    title: "Migração do RD concluída",
    detail: "Campos que o CRM pede e o RD não tinha foram preenchidos; o lead segue normalmente.",
    etapa: ctx.opportunity.etapa,
    actorAppUserId,
    sourceId: `rd-migracao-concluida:${ctx.opportunity.id}`,
    createdAt: now,
  });
}

/**
 * Migração concluída num lead que já está com outro time: avisa como o fluxo normal avisaria
 * (na conversão em lote os avisos ficam desligados). Falha no aviso não desfaz o salvamento.
 */
async function notifyNextTeam(supabase: SupabaseClient, ctx: MigrationContext, values: RdMigrationValues): Promise<void> {
  const opportunityId = ctx.opportunity.id;
  const leadName = ctx.opportunity.solicitante_nome;
  try {
    if (ctx.opportunity.etapa === "cadastro_novo_cliente") {
      await notifyAudience(
        supabase,
        { modules: ["operacoes_legais"] },
        {
          tipo: "cadastro_cliente_pendente",
          title: `Cadastro de novo cliente — ${leadName}`,
          preview: `${values.onboarding.cadastro.razaoSocial || leadName}: veio do RD na virada. Confira os dados, cadastre no VIOS e defina o grupo.`,
          path: `/crm/leads/${encodeURIComponent(opportunityId)}?tab=onboarding`,
          idempotencyKey: `rd-migracao-cadastro:${opportunityId}`,
          extra: { oportunidade_id: opportunityId },
        },
      );
    }
    if (ctx.opportunity.etapa === "inclusao_faturamento") {
      await onEnteredInclusaoFaturamento(supabase, { opportunityId, leadName });
    }
  } catch (error) {
    logServerError("rd-migration/notify", error, { opportunityId });
  }
}

/**
 * Salva o formulário. Antes da virada fica como rascunho; num lead já convertido, grava no CRM
 * (cadastro, campos, documentos, cadastro do cliente) e conclui a migração quando nada falta.
 */
export async function saveRdMigration(
  supabase: SupabaseClient,
  input: { opportunityId: string; actor: RdMigrationActor; values: unknown; expectedUpdatedAt?: string | null },
): Promise<{ detail: RdMigrationDetail; warnings: string[] }> {
  const { ctx, schemaPending, shared } = await loadContext(supabase, input.opportunityId);
  if (schemaPending) throw RD_MIGRATION_SCHEMA_PENDING;
  if (!canEditMigration(ctx, input.actor)) {
    throw new PublicError(
      ctx.status === "concluida"
        ? "A migração deste lead já foi concluída; edite pela ficha do lead."
        : ctx.status === "fora"
          ? "Este negócio está fora da migração."
          : "Só o responsável pelo lead e o admin preenchem esta migração.",
      403,
      "FORBIDDEN",
    );
  }
  if (!ctx.stage) throw new PublicError("Este negócio está fora da migração.", 422, "OUT_OF_SCOPE");

  const values = parseRdMigrationValues(input.values);
  const now = new Date().toISOString();
  const converted = Boolean(ctx.opportunity.rd_migrado_em);
  const warnings: string[] = [];

  if (!converted) {
    await upsertMigrationRow(
      supabase,
      ctx,
      { payload: values as unknown as Json, status: "pendente", atualizado_por: input.actor.appUserId },
      input.expectedUpdatedAt,
    );
  } else {
    const requirements = computeRdMigrationRequirements({
      stage: ctx.opportunity.etapa,
      values,
      fieldDefinitions: shared.fieldDefinitions,
      responsibleAppUserId: ctx.responsible?.appUserId ?? null,
    });
    const plan = planRdMigration({
      mode: "update",
      opportunity: {
        id: ctx.opportunity.id,
        etapa: ctx.opportunity.etapa,
        vendaFechadaEm: ctx.opportunity.venda_fechada_em ?? null,
        solicitanteEmail: ctx.opportunity.solicitante_email,
      },
      rdStage: ctx.opportunity.etapa,
      values,
      requirements,
      responsible: ctx.responsible,
      deal: ctx.deal,
      actorEmail: input.actor.email,
      now,
    });
    warnings.push(
      ...(await applyPlan(supabase, plan, {
        definitions: shared.fieldDefinitions,
        actorAppUserId: input.actor.appUserId,
        leadName: ctx.opportunity.solicitante_nome,
        clienteId: (ctx.opportunity as { cliente_id?: string | null }).cliente_id ?? null,
        notify: true,
      })),
    );
    const concluded = requirements.complete;
    await upsertMigrationRow(
      supabase,
      ctx,
      {
        payload: values as unknown as Json,
        atualizado_por: input.actor.appUserId,
        ...(concluded
          ? { status: "concluida", concluida_em: now, concluida_por: input.actor.appUserId }
          : { status: "convertida" }),
      },
      input.expectedUpdatedAt,
    );
    if (concluded) {
      await markConcluded(supabase, ctx, input.actor.appUserId, now);
      await notifyNextTeam(supabase, ctx, values);
    }
  }

  const detail = await loadRdMigrationDetail(supabase, input.opportunityId, input.actor);
  return { detail, warnings };
}

/** Admin: escolhe o responsável ou tira/devolve o negócio da migração. */
export async function updateRdMigrationAdmin(
  supabase: SupabaseClient,
  input: {
    opportunityId: string;
    actor: RdMigrationActor;
    responsavelAppUserId?: string | null;
    fora?: { motivo: string } | false;
  },
): Promise<RdMigrationDetail> {
  if (!input.actor.isAdmin) throw new PublicError("Só o admin altera a fila da migração.", 403, "FORBIDDEN");
  const { ctx, schemaPending } = await loadContext(supabase, input.opportunityId);
  if (schemaPending) throw RD_MIGRATION_SCHEMA_PENDING;
  const patch: Record<string, unknown> = { atualizado_por: input.actor.appUserId };
  if (input.responsavelAppUserId !== undefined) patch.responsavel_app_user_id = input.responsavelAppUserId;
  if (input.fora) {
    if (ctx.opportunity.rd_migrado_em) {
      throw new PublicError("O lead já foi convertido; não dá para tirá-lo da migração.", 409, "ALREADY_CONVERTED");
    }
    patch.status = "fora";
    patch.motivo_fora = input.fora.motivo;
  } else if (input.fora === false && ctx.status === "fora") {
    patch.status = "pendente";
    patch.motivo_fora = null;
  }
  await upsertMigrationRow(supabase, ctx, patch);
  return loadRdMigrationDetail(supabase, input.opportunityId, input.actor);
}

// ── Conversão ─────────────────────────────────────────────────────────────────

export type RdConversionOutcome =
  | { opportunityId: string; outcome: "converted"; status: "convertida" | "concluida"; stage: OpportunityStage; warnings: string[] }
  | { opportunityId: string; outcome: "skipped"; reason: string };

async function convertContext(
  supabase: SupabaseClient,
  ctx: MigrationContext,
  shared: SharedData,
  actor: RdMigrationActor,
  options: { notify: boolean },
): Promise<RdConversionOutcome> {
  const opportunityId = ctx.opportunity.id;
  if (ctx.opportunity.rd_migrado_em) return { opportunityId, outcome: "skipped", reason: "já convertido" };
  if (ctx.status === "fora") return { opportunityId, outcome: "skipped", reason: "fora da migração" };
  if (!ctx.scope.inScope || !ctx.stage || !ctx.requirements) {
    return { opportunityId, outcome: "skipped", reason: "etapa fora da migração ou negócio perdido" };
  }

  const now = new Date().toISOString();
  const plan = planRdMigration({
    mode: "convert",
    opportunity: {
      id: opportunityId,
      etapa: ctx.opportunity.etapa,
      vendaFechadaEm: ctx.opportunity.venda_fechada_em ?? null,
      solicitanteEmail: ctx.opportunity.solicitante_email,
    },
    rdStage: ctx.scope.rdStage,
    values: ctx.values,
    requirements: ctx.requirements,
    responsible: ctx.responsible,
    deal: ctx.deal,
    actorEmail: actor.email,
    now,
  });

  // A linha da fila nasce antes (como rascunho), para o lead convertido nunca ficar sem ela;
  // só vira "convertida"/"concluida" depois que o lead foi gravado.
  await upsertMigrationRow(supabase, ctx, { payload: ctx.values as unknown as Json, atualizado_por: actor.appUserId });
  const warnings = await applyPlan(supabase, plan, {
    definitions: shared.fieldDefinitions,
    actorAppUserId: actor.appUserId,
    leadName: ctx.opportunity.solicitante_nome,
    clienteId: (ctx.opportunity as { cliente_id?: string | null }).cliente_id ?? null,
    notify: options.notify,
  });
  // A linha já existe (gravada acima): o segundo passo é sempre update.
  await upsertMigrationRow(
    supabase,
    { ...ctx, row: ctx.row ?? ({ oportunidade_id: opportunityId } as MigrationRow) },
    {
      status: plan.migrationStatus,
      etapa_destino: plan.targetStage,
      convertida_em: now,
      convertida_por: actor.appUserId,
      ...(plan.migrationStatus === "concluida" ? { concluida_em: now, concluida_por: actor.appUserId } : {}),
    },
  );

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: opportunityId,
    kind: "rd_migrado",
    title: "Lead migrado do RD Station",
    detail: `${ctx.deal?.stageLabel ?? "RD"} → ${OPPORTUNITY_STAGE_LABELS[plan.targetStage]}${
      plan.migrationStatus === "convertida" ? " · migração com pendências" : ""
    }`,
    etapa: plan.targetStage,
    actorAppUserId: actor.appUserId,
    sourceId: `rd-migrado:${opportunityId}`,
    metadata: { rd_deal_id: ctx.rdDealId, from: plan.fromStage, to: plan.targetStage, status: plan.migrationStatus },
    createdAt: now,
  });
  if (plan.migrationStatus === "concluida") await markConcluded(supabase, ctx, actor.appUserId, now);

  return { opportunityId, outcome: "converted", status: plan.migrationStatus, stage: plan.targetStage, warnings };
}

/** Admin: converte um negócio (piloto ou correção depois da virada). */
export async function convertRdMigration(
  supabase: SupabaseClient,
  input: { opportunityId: string; actor: RdMigrationActor },
): Promise<RdConversionOutcome> {
  if (!input.actor.isAdmin) throw new PublicError("Só o admin converte negócios do RD.", 403, "FORBIDDEN");
  const { ctx, schemaPending, shared } = await loadContext(supabase, input.opportunityId);
  if (schemaPending) throw RD_MIGRATION_SCHEMA_PENDING;
  return convertContext(supabase, ctx, shared, input.actor, { notify: true });
}

export type RdCutoverSummary = {
  converted: number;
  concluded: number;
  pending: number;
  skipped: number;
  failed: Array<{ opportunityId: string; nome: string; error: string }>;
  /** Negócios do mesmo cliente que o admin ainda não resolveu (ficaram sem converter). */
  duplicates: number;
  remaining: number;
  finishedAt: string;
};

/**
 * Dia da virada: converte todos os negócios em escopo, um por vez, até o prazo. Pode rodar de
 * novo: o que já foi convertido é pulado. Sem aviso por lead (o time é avisado da virada).
 */
export async function convertAllRdMigrations(
  supabase: SupabaseClient,
  input: { actor: RdMigrationActor; deadlineMs: number },
): Promise<RdCutoverSummary> {
  if (!input.actor.isAdmin) throw new PublicError("Só o admin converte negócios do RD.", 403, "FORBIDDEN");
  const startedAt = Date.now();
  const { contexts, schemaPending, shared } = await loadAllContexts(supabase);
  if (schemaPending) throw RD_MIGRATION_SCHEMA_PENDING;

  const queue = contexts.filter(
    (c) => !c.opportunity.rd_migrado_em && c.status !== "fora" && c.scope.inScope && c.stage,
  );
  const summary: RdCutoverSummary = {
    converted: 0,
    concluded: 0,
    pending: 0,
    skipped: 0,
    failed: [],
    duplicates: 0,
    remaining: 0,
    finishedAt: "",
  };
  for (let i = 0; i < queue.length; i += 1) {
    if (Date.now() - startedAt > input.deadlineMs) {
      summary.remaining = queue.length - i;
      break;
    }
    const ctx = queue[i];
    if (ctx.duplicate) {
      // Converter os dois criaria dois leads para o mesmo cliente: o admin escolhe antes.
      summary.duplicates += 1;
      continue;
    }
    try {
      const result = await convertContext(supabase, ctx, shared, input.actor, { notify: false });
      if (result.outcome === "converted") {
        summary.converted += 1;
        if (result.status === "concluida") summary.concluded += 1;
        else summary.pending += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      const ref = logServerError("rd-migration/convert-all", error, { opportunityId: ctx.opportunity.id });
      summary.failed.push({
        opportunityId: ctx.opportunity.id,
        nome: ctx.opportunity.solicitante_nome,
        error: error instanceof PublicError ? error.message : `Falha ao converter (ref ${ref}).`,
      });
    }
  }
  summary.finishedAt = new Date().toISOString();

  const { error } = await supabase
    .from("rd_virada")
    .update({
      convertido_em: summary.finishedAt,
      convertido_por: input.actor.appUserId,
      ultimo_resumo: summary as unknown as Json,
    })
    .eq("id", 1);
  if (error) logServerError("rd-migration/virada-resumo", error);
  return summary;
}

/** Congela (ou reabre) o sync do RD: webhook e cron passam a ignorar tudo. */
export async function setRdSyncFrozen(
  supabase: SupabaseClient,
  input: { actor: RdMigrationActor; frozen: boolean },
): Promise<RdViradaState> {
  if (!input.actor.isAdmin) throw new PublicError("Só o admin congela o RD.", 403, "FORBIDDEN");
  const now = new Date().toISOString();
  const { error } = await supabase.from("rd_virada").upsert(
    {
      id: 1,
      congelado_em: input.frozen ? now : null,
      congelado_por: input.frozen ? input.actor.appUserId : null,
    },
    { onConflict: "id" },
  );
  if (error) {
    if (isMissingRdMigrationSchema(error)) throw RD_MIGRATION_SCHEMA_PENDING;
    throw error;
  }
  const state = await loadRdViradaState(supabase);
  return { congeladoEm: state.congeladoEm, convertidoEm: state.convertidoEm, ultimoResumo: state.ultimoResumo };
}

/**
 * Rollback do runbook: os leads convertidos voltam a ser do RD (só leitura, etapa pelo RD) e a
 * migração volta para rascunho. Cadastro, campos e rascunho de contrato gravados ficam (o RD
 * ignora); a próxima importação do RD acerta etapa e encerramento.
 */
export async function rollbackRdMigrations(
  supabase: SupabaseClient,
  input: { actor: RdMigrationActor },
): Promise<{ reverted: number }> {
  if (!input.actor.isAdmin) throw new PublicError("Só o admin desfaz a virada.", 403, "FORBIDDEN");
  const { data, error } = await supabase
    .from("rd_migracoes")
    .select("oportunidade_id")
    .in("status", ["convertida", "concluida"]);
  if (error) {
    if (isMissingRdMigrationSchema(error)) throw RD_MIGRATION_SCHEMA_PENDING;
    throw error;
  }
  const ids = ((data ?? []) as Array<{ oportunidade_id: string }>).map((r) => r.oportunidade_id);
  const reconciliations = ids.length ? await loadReconciliationsFromTable(supabase) : new Map();
  const now = new Date().toISOString();
  for (const id of ids) {
    const stage = opportunityStageFromReconciliationDetails(reconciliations.get(id)?.detalhes);
    const update: Record<string, unknown> = { rd_migrado_em: null, updated_at: now };
    if (stage) update.etapa = stage;
    const { error: oppError } = await supabase.from("oportunidades").update(update as never).eq("id", id);
    if (oppError) throw oppError;
    await supabase
      .from("rd_migracoes")
      .update({
        status: "pendente",
        convertida_em: null,
        convertida_por: null,
        concluida_em: null,
        concluida_por: null,
        atualizado_por: input.actor.appUserId,
      } as never)
      .eq("oportunidade_id", id);
  }
  await supabase
    .from("rd_virada")
    .update({ congelado_em: null, congelado_por: null, convertido_em: null, convertido_por: null })
    .eq("id", 1);
  return { reverted: ids.length };
}

// ── D4Sign ────────────────────────────────────────────────────────────────────

export type RdMigrationD4SignDocument = {
  uuid: string;
  name: string | null;
  statusName: string | null;
  createdAt: string | null;
  finalizedAt: string | null;
  linkedOpportunityId: string | null;
};

/** Documentos do cofre da D4Sign pelo nome, para ligar o contrato enviado/assinado pelo processo do RD. */
export async function searchD4SignDocumentsForMigration(
  supabase: SupabaseClient,
  query: string,
): Promise<RdMigrationD4SignDocument[]> {
  const q = query.trim().replace(/[%,()]/g, " ").trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, name_document, status_name, created_at_d4sign, finalized_at, oportunidade_id")
    .ilike("name_document", `%${q}%`)
    .order("created_at_d4sign", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  return (
    (data ?? []) as Array<{
      uuid_doc: string;
      name_document: string | null;
      status_name: string | null;
      created_at_d4sign: string | null;
      finalized_at: string | null;
      oportunidade_id: string | null;
    }>
  ).map((d) => ({
    uuid: d.uuid_doc,
    name: d.name_document,
    statusName: d.status_name,
    createdAt: d.created_at_d4sign,
    finalizedAt: d.finalized_at,
    linkedOpportunityId: d.oportunidade_id,
  }));
}
