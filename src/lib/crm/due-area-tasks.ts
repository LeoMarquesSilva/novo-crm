import type { SupabaseClient } from "@supabase/supabase-js";
import { appUserAreaCandidatesForScopeKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { actorFromAppUserRow, type InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import {
  getDueAreaTaskStatus,
  isDueAreaTaskDelivered,
  isDueReviewApprovedForCycle,
  type DueAreaTaskStatus,
} from "@/lib/crm/due-area-task-status";
import { EvolutionWhatsappConnector } from "@/modules/crm/infrastructure/integrations/evolution-whatsapp";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import {
  buildLevantamentoConcluidoValues,
  buildRevisaoAjusteAdicionalValues,
  buildRevisaoInicioValues,
  buildRevisaoResultadoValues,
  decideAjusteAdicional,
  decideReviewCycleResult,
  type RevisorDaArea,
} from "@/lib/crm/whatsapp/due-messages";
import {
  claimWhatsappSend,
  findWhatsappSend,
  markWhatsappSendFailed,
  withOneWhatsappRetry,
} from "@/lib/crm/whatsapp/send-log";
import { buildWhatsappMessage } from "@/lib/crm/whatsapp/template-store";
import { dueAreaFromCrmKey } from "@/lib/due-ppt/areas";
import { selectInChunks } from "@/lib/supabase/select-in-chunks";
export { getDueAreaTaskStatus, type DueAreaTaskStatus } from "@/lib/crm/due-area-task-status";

export type DueAreaTaskSummary = {
  total: number;
  disponibilizados: number;
  atrasados: number;
};

/** Uma linha por área no Kanban / API de leads (detalhe do levantamento DUE). */
export type DueAreaTaskBreakdownRow = {
  areaKey: string;
  entregue: boolean;
  emAtraso: boolean;
  /** Entrega válida sem pasta (sem processos ativos). */
  semProcessosAtivos: boolean;
};

/** Uma linha por área na revisão DUE (ciclo atual). */
export type DueAreaReviewBreakdownRow = {
  areaKey: string;
  reviewed: boolean;
  requestedAdjustments: boolean;
};

export type DueAreaReviewSummary = {
  total: number;
  reviewed: number;
  pending: number;
};

export async function getDueAreaTasksSummaryWithBreakdown(
  supabase: SupabaseClient,
  oportunidadeIds: string[],
): Promise<{
  summary: Map<string, DueAreaTaskSummary>;
  breakdown: Map<string, DueAreaTaskBreakdownRow[]>;
}> {
  const summary = new Map<string, DueAreaTaskSummary>();
  const breakdown = new Map<string, DueAreaTaskBreakdownRow[]>();
  const ids = [...new Set(oportunidadeIds.filter(Boolean))];
  if (ids.length === 0) return { summary, breakdown };

  const { data } = await selectInChunks(ids, (chunk) =>
    supabase
      .from("due_area_tasks")
      .select("oportunidade_id, area_key, status, prazo_ate, pasta_due_confirmada, sem_processos_ativos")
      .in("oportunidade_id", chunk),
  );

  for (const row of data ?? []) {
    const id = row.oportunidade_id as string;
    const current = summary.get(id) ?? { total: 0, disponibilizados: 0, atrasados: 0 };
    current.total += 1;
    const entregue = isDueAreaTaskDelivered({
      status: row.status,
      pasta_due_confirmada: row.pasta_due_confirmada,
      sem_processos_ativos: row.sem_processos_ativos,
    });
    if (entregue) current.disponibilizados += 1;
    if (
      getDueAreaTaskStatus({ status: row.status as DueAreaTaskStatus, prazoAte: row.prazo_ate }) ===
      "atrasado"
    ) {
      current.atrasados += 1;
    }
    summary.set(id, current);

    const list = breakdown.get(id) ?? [];
    list.push({
      areaKey: row.area_key,
      entregue,
      emAtraso:
        getDueAreaTaskStatus({ status: row.status as DueAreaTaskStatus, prazoAte: row.prazo_ate }) ===
        "atrasado",
      semProcessosAtivos: Boolean(row.sem_processos_ativos) && row.status === "disponibilizado",
    });
    breakdown.set(id, list);
  }

  for (const [, list] of breakdown) {
    list.sort((a, b) => a.areaKey.localeCompare(b.areaKey, "pt-BR", { sensitivity: "base" }));
  }

  return { summary, breakdown };
}

export async function getDueAreaReviewSummaryWithBreakdown(
  supabase: SupabaseClient,
  cycleByOpportunityId: Map<string, number>,
): Promise<{
  summary: Map<string, DueAreaReviewSummary>;
  breakdown: Map<string, DueAreaReviewBreakdownRow[]>;
}> {
  const summary = new Map<string, DueAreaReviewSummary>();
  const breakdown = new Map<string, DueAreaReviewBreakdownRow[]>();
  const ids = [...cycleByOpportunityId.keys()].filter(Boolean);
  if (ids.length === 0) return { summary, breakdown };

  const { data } = await selectInChunks(ids, (chunk) =>
    supabase
      .from("due_area_review_tasks")
      .select("oportunidade_id, revision_cycle, area_key, status")
      .in("oportunidade_id", chunk),
  );

  for (const row of data ?? []) {
    const id = String(row.oportunidade_id);
    const wantedCycle = cycleByOpportunityId.get(id) ?? 0;
    const rowCycle = Number(row.revision_cycle) || 0;
    if (wantedCycle < 1 || rowCycle !== wantedCycle) continue;

    const reviewed = row.status === "ok" || row.status === "ajustes_solicitados";
    const requestedAdjustments = row.status === "ajustes_solicitados";

    const current = summary.get(id) ?? { total: 0, reviewed: 0, pending: 0 };
    current.total += 1;
    if (reviewed) current.reviewed += 1;
    else current.pending += 1;
    summary.set(id, current);

    const list = breakdown.get(id) ?? [];
    list.push({
      areaKey: String(row.area_key),
      reviewed,
      requestedAdjustments,
    });
    breakdown.set(id, list);
  }

  for (const [, list] of breakdown) {
    list.sort((a, b) => a.areaKey.localeCompare(b.areaKey, "pt-BR", { sensitivity: "base" }));
  }

  return { summary, breakdown };
}

export const DUE_AREA_TASK_CHECKLIST = [
  "Levantar informações e bases da área.",
  "Validar cliente, CNPJs e escopo solicitado.",
  "Disponibilizar os arquivos na pasta Due Diligence.",
  "Confirmar no CRM que os dados foram disponibilizados.",
] as const;

const LEONARDO_EMAIL = "leonardo.marques@bismarchipires.com.br";

/** Resolve auth.users.id do compilador (Leonardo Marques Silva) por e-mail ou nome em app_users. */
export async function resolveLeonardoAuthUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byEmail = authList?.users?.find((u) => u.email?.toLowerCase().trim() === LEONARDO_EMAIL);
  if (byEmail?.id) return byEmail.id;

  const { data: appRow } = await supabase
    .from("app_users")
    .select("auth_user_id")
    .ilike("full_name", "%Leonardo Marques Silva%")
    .limit(1)
    .maybeSingle();
  return appRow?.auth_user_id ?? null;
}

/** Entrega válida: disponibilizado na pasta OU marcado sem processos ativos (com observação opcional). */
export { isDueAreaTaskDelivered };

function getPublicAppUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "";
  if (!base) return "";
  return base.startsWith("http") ? base : `https://${base}`;
}

function combineDateAndTimeIso(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const normalizedTime = time?.trim() || "18:00";
  const value = `${date}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function elapsedMs(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms);
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "CRM <onboarding@resend.dev>";
  if (!key) return false;
  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}

async function sendDueWhatsappText(supabase: SupabaseClient, text: string): Promise<boolean> {
  const { data: config, error: cfgErr } = await supabase
    .from("whatsapp_due_config")
    .select("destination, is_active")
    .eq("is_active", true)
    .eq("use_case", "due_diligence")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cfgErr || !config?.destination) return false;

  try {
    const connector = new EvolutionWhatsappConnector(
      process.env.EVOLUTION_API_URL ?? "",
      process.env.EVOLUTION_API_KEY ?? "",
      process.env.EVOLUTION_INSTANCE ?? process.env.EVOLUTION_INSTANCE_NAME ?? "BP",
    );
    await withOneWhatsappRetry(() => connector.sendText({ destination: config.destination, text }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Uma mensagem consolidada no WhatsApp da DUE, no máximo uma vez por `sourceId` (trava no histórico do lead).
 * Devolve se saiu.
 */
async function sendDueWhatsappOnce(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; sourceId: string; title: string; text: string },
): Promise<boolean> {
  if (!(await claimWhatsappSend(supabase, input))) return false;
  const sent = await sendDueWhatsappText(supabase, input.text);
  if (!sent) await markWhatsappSendFailed(supabase, input);
  return sent;
}

export async function findDueAreaResponsibleAppUserId(
  supabase: SupabaseClient,
  areaKey: string,
): Promise<string | null> {
  const trimmed = areaKey.trim();
  if (!trimmed) return null;
  const candidates = appUserAreaCandidatesForScopeKey(trimmed);
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .in("area", candidates)
    .order("full_name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export async function syncDueAreaTasksForOpportunity(
  supabase: SupabaseClient,
  oportunidadeId: string,
  options?: { originado_por?: InAppNotificationActor | null },
): Promise<void> {
  const [{ data: op }, { data: intake }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select("etapa, havera_due_diligence")
      .eq("id", oportunidadeId)
      .maybeSingle(),
    supabase
      .from("lead_intakes")
      .select("areas_analise, data_entrega_due, horario_entrega_due")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle(),
  ]);

  if (!op?.havera_due_diligence || op.etapa !== "levantamento_dados" || !intake) return;

  const rawAreas = Array.isArray(intake.areas_analise) ? intake.areas_analise : [];
  const areas = [...new Set(rawAreas.map((area) => normalizePracticeAreaKey(String(area))).filter(Boolean))];
  const areaSet = new Set(areas);
  const prazoAte = combineDateAndTimeIso(
    intake.data_entrega_due as string | null,
    intake.horario_entrega_due as string | null,
  );

  const { data: existing } = await supabase
    .from("due_area_tasks")
    .select("id, area_key")
    .eq("oportunidade_id", oportunidadeId);

  for (const row of existing ?? []) {
    if (!areaSet.has(row.area_key)) {
      await supabase.from("due_area_tasks").delete().eq("id", row.id);
    }
  }

  for (const area of areas) {
    const responsavelId = await findDueAreaResponsibleAppUserId(supabase, area);
    await supabase.from("due_area_tasks").upsert(
      {
        oportunidade_id: oportunidadeId,
        area_key: area,
        responsavel_app_user_id: responsavelId,
        prazo_ate: prazoAte,
        checklist_json: DUE_AREA_TASK_CHECKLIST as unknown as string[],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "oportunidade_id,area_key" },
    );
  }

  await dispatchDueAreaTaskNotifications(supabase, oportunidadeId, options?.originado_por);
}

export async function getDueAreaTasksSummary(
  supabase: SupabaseClient,
  oportunidadeIds: string[],
): Promise<Map<string, DueAreaTaskSummary>> {
  const { summary } = await getDueAreaTasksSummaryWithBreakdown(supabase, oportunidadeIds);
  return summary;
}

export async function allDueAreaTasksAreAvailable(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<{ ok: boolean; pendingAreas: string[] }> {
  const { data } = await supabase
    .from("due_area_tasks")
    .select("area_key, status, pasta_due_confirmada, sem_processos_ativos")
    .eq("oportunidade_id", oportunidadeId);

  const rows = data ?? [];
  if (rows.length === 0) return { ok: false, pendingAreas: ["nenhuma área gerada"] };

  const pendingAreas = rows
    .filter(
      (row) =>
        !isDueAreaTaskDelivered({
          status: row.status,
          pasta_due_confirmada: row.pasta_due_confirmada,
          sem_processos_ativos: row.sem_processos_ativos,
        }),
    )
    .map((row) => row.area_key);

  return { ok: pendingAreas.length === 0, pendingAreas };
}

const REVIEW_PRAZO_HORAS_DEFAULT = 120;

/** Avança automaticamente Levantamento → Compilação quando todas as áreas entregaram. Retorna true se avançou. */
export async function tryAutoAdvanceLevantamentoToCompilacao(
  supabase: SupabaseClient,
  oportunidadeId: string,
  alteredByAppUserId: string | null,
): Promise<boolean> {
  const { data: op } = await supabase
    .from("oportunidades")
    .select("etapa, havera_due_diligence")
    .eq("id", oportunidadeId)
    .maybeSingle();

  if (!op?.havera_due_diligence || op.etapa !== "levantamento_dados") return false;

  const { data: rows } = await supabase
    .from("due_area_tasks")
    .select("area_key, status, pasta_due_confirmada, sem_processos_ativos")
    .eq("oportunidade_id", oportunidadeId);

  if (!rows?.length) return false;

  const allDone = rows.every((row) =>
    isDueAreaTaskDelivered({
      status: row.status,
      pasta_due_confirmada: row.pasta_due_confirmada,
      sem_processos_ativos: row.sem_processos_ativos,
    }),
  );

  if (!allDone) return false;

  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("oportunidades")
    .update({
      etapa: "compilacao",
      updated_at: now,
      due_compilacao_entrada_em: now,
    })
    .eq("id", oportunidadeId)
    .eq("etapa", "levantamento_dados")
    .select("id")
    .maybeSingle();

  if (updErr || !updated?.id) return false;

  await supabase.from("transicoes_etapa").insert({
    oportunidade_id: oportunidadeId,
    etapa_origem: "levantamento_dados",
    etapa_destino: "compilacao",
    alterado_por: alteredByAppUserId,
    observacao: "Automático: todas as áreas concluíram o levantamento DUE.",
  });

  let originadoPor: InAppNotificationActor | null = null;
  if (alteredByAppUserId) {
    const { data: actorRow } = await supabase
      .from("app_users")
      .select("id, full_name, avatar_url")
      .eq("id", alteredByAppUserId)
      .maybeSingle();
    originadoPor = actorFromAppUserRow(actorRow);
  }
  await notifyDueCompilationOwner(supabase, oportunidadeId, originadoPor);
  await notifyDueLevantamentoConcluidoWhatsapp(supabase, oportunidadeId);
  return true;
}

/** WhatsApp da DUE: uma mensagem quando a última área entrega, com o que cada área entregou. */
async function notifyDueLevantamentoConcluidoWhatsapp(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<void> {
  const [{ data: op }, { data: tasks }, { data: docs }] = await Promise.all([
    supabase.from("oportunidades").select("solicitante_nome").eq("id", oportunidadeId).maybeSingle(),
    supabase
      .from("due_area_tasks")
      .select("area_key, sem_processos_ativos")
      .eq("oportunidade_id", oportunidadeId)
      .order("area_key", { ascending: true }),
    supabase
      .from("due_documents")
      .select("area_key, original_filename")
      .eq("oportunidade_id", oportunidadeId)
      .eq("document_kind", "planilha_area"),
  ]);
  if (!op || !tasks?.length) return;

  const leadPath = `/crm/leads/${oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const text = await buildWhatsappMessage(
    supabase,
    "due_levantamento_concluido",
    buildLevantamentoConcluidoValues({
      cliente: String(op.solicitante_nome ?? ""),
      entregas: tasks.map((task) => {
        const dueArea = dueAreaFromCrmKey(String(task.area_key));
        return {
          area: String(task.area_key),
          semProcessosAtivos: Boolean(task.sem_processos_ativos),
          planilhas: (docs ?? [])
            .filter((doc) => dueArea && doc.area_key === dueArea)
            .map((doc) => String(doc.original_filename)),
        };
      }),
      link: appUrl ? `${appUrl}${leadPath}` : leadPath,
    }),
  );
  if (!text) return;
  await sendDueWhatsappOnce(supabase, {
    oportunidadeId,
    sourceId: "due-levantamento-concluido",
    title: "WhatsApp: levantamento da DUE concluído",
    text,
  });
}

/**
 * Área sem ninguém com `app_users.area`: a tarefa nasceria sem aviso para ninguém e a DUE parava ali
 * (teste ponta a ponta 4: Recuperação de Créditos). Avisa o responsável do lead (sino e e-mail). No WhatsApp
 * o alerta vai dentro da mensagem do novo lead e da mensagem de revisão, não numa mensagem própria.
 * Devolve o texto gravado em `ultimo_erro_canais`.
 */
async function notifyDueAreaWithoutResponsible(
  supabase: SupabaseClient,
  input: {
    oportunidadeId: string;
    leadName: string;
    areaKey: string;
    etapa: "levantamento" | "revisao";
    leadPath: string;
    originadoPor?: InAppNotificationActor | null;
  },
): Promise<string> {
  const title = `DUE sem responsável - ${input.areaKey}`;
  const preview = `Ninguém tem a área ${input.areaKey} no cadastro de usuários. Defina quem faz ${
    input.etapa === "levantamento" ? "o levantamento" : "a revisão"
  } da DUE de ${input.leadName}.`;
  let notified = 0;
  try {
    const recipients = await notifyAudience(
      supabase,
      { leadOwnerOf: input.oportunidadeId },
      {
        tipo: "due_area_sem_responsavel",
        title,
        preview,
        path: input.leadPath,
        idempotencyKey: `due-sem-responsavel:${input.oportunidadeId}:${input.etapa}:${input.areaKey}`,
        extra: {
          oportunidade_id: input.oportunidadeId,
          area_key: input.areaKey,
          ...(input.originadoPor ? { originado_por: input.originadoPor } : {}),
        },
      },
    );
    notified = recipients.length;
  } catch {
    notified = 0;
  }
  return `Sem responsável com app_users.area igual a esta área. Avisado o responsável do lead (${notified}).`;
}

async function dispatchDueAreaTaskNotifications(
  supabase: SupabaseClient,
  oportunidadeId: string,
  originadoPor?: InAppNotificationActor | null,
): Promise<void> {
  const [{ data: op }, { data: pending }] = await Promise.all([
    supabase.from("oportunidades").select("solicitante_nome").eq("id", oportunidadeId).maybeSingle(),
    supabase
      .from("due_area_tasks")
      .select("id, area_key, responsavel_app_user_id")
      .eq("oportunidade_id", oportunidadeId)
      .is("notificado_em", null),
  ]);
  if (!op || !pending?.length) return;

  const leadPath = `/crm/leads/${oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const link = appUrl ? `${appUrl}${leadPath}` : leadPath;

  for (const row of pending) {
    const now = new Date().toISOString();
    if (!row.responsavel_app_user_id) {
      const aviso = await notifyDueAreaWithoutResponsible(supabase, {
        oportunidadeId,
        leadName: String(op.solicitante_nome ?? "-"),
        areaKey: row.area_key,
        etapa: "levantamento",
        leadPath,
        originadoPor,
      });
      await supabase
        .from("due_area_tasks")
        .update({ notificado_em: now, ultimo_erro_canais: aviso, updated_at: now })
        .eq("id", row.id);
      continue;
    }

    const { data: user } = await supabase
      .from("app_users")
      .select("auth_user_id, full_name")
      .eq("id", row.responsavel_app_user_id)
      .maybeSingle();

    let emailOk = false;
    let errMsg: string | null = null;
    if (user?.auth_user_id) {
      const title = `Levantamento DUE - ${row.area_key}`;
      const bodyText = `Oportunidade: ${String(op.solicitante_nome ?? "-")}. Área: ${row.area_key}. Levante as informações e disponibilize os arquivos na pasta Due Diligence.`;

      const { error: nInsErr } = await supabase.from("crm_in_app_notifications").insert({
        user_id: user.auth_user_id,
        tipo: "due_area_task",
        payload: {
          oportunidade_id: oportunidadeId,
          area_key: row.area_key,
          path: leadPath,
          link,
          title,
          ...(originadoPor ? { originado_por: originadoPor } : {}),
        } as never,
      });
      if (nInsErr) errMsg = `in-app ${user.full_name}: ${nInsErr.message}`;

      const { data: authData } = await supabase.auth.admin.getUserById(user.auth_user_id);
      const email = authData.user?.email ?? null;
      if (email) {
        emailOk = await sendResendEmail(
          email,
          title,
          `<p>${bodyText}</p><p><a href="${link}">Abrir oportunidade no CRM</a></p>`,
        );
      }
    } else {
      errMsg = "Responsável sem auth_user_id.";
    }

    await supabase
      .from("due_area_tasks")
      .update({
        notificado_em: now,
        email_enviado_em: emailOk ? now : null,
        ultimo_erro_canais: errMsg,
        updated_at: now,
      })
      .eq("id", row.id);
  }
}

export async function notifyDueCompilationOwner(
  supabase: SupabaseClient,
  oportunidadeId: string,
  originadoPor?: InAppNotificationActor | null,
): Promise<void> {
  const { data: op } = await supabase
    .from("oportunidades")
    .select("solicitante_nome")
    .eq("id", oportunidadeId)
    .maybeSingle();
  const authId = await resolveLeonardoAuthUserId(supabase);
  if (!op || !authId) return;

  const leadPath = `/crm/leads/${oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const link = appUrl ? `${appUrl}${leadPath}` : leadPath;
  const title = "DUE pronta para compilação";
  const preview = String(op.solicitante_nome ?? "");

  await supabase.from("crm_in_app_notifications").insert({
    user_id: authId,
    tipo: "due_compilacao",
    payload: {
      oportunidade_id: oportunidadeId,
      path: leadPath,
      link,
      title,
      preview,
      ...(originadoPor ? { originado_por: originadoPor } : {}),
    } as never,
  });

  const { data: authData } = await supabase.auth.admin.getUserById(authId);
  const email = authData.user?.email ?? null;
  if (email) {
    await sendResendEmail(
      email,
      title,
      `<p>Todas as áreas concluíram o levantamento. Compilação disponível para ${preview}.</p><p><a href="${link}">Abrir no CRM</a></p>`,
    );
  }
}

export async function countDuePptDocuments(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("due_documents")
    .select("*", { count: "exact", head: true })
    .eq("oportunidade_id", oportunidadeId)
    .eq("document_kind", "ppt_compilacao");
  if (error) return 0;
  return count ?? 0;
}

/** Cria/atualiza linhas de revisão para o ciclo informado (uma por área do intake). */
export async function syncDueAreaReviewTasksForOpportunity(
  supabase: SupabaseClient,
  oportunidadeId: string,
  revisionCycle: number,
  areaKeys?: string[],
): Promise<void> {
  let areas: string[] = [];
  if (Array.isArray(areaKeys) && areaKeys.length > 0) {
    areas = [...new Set(areaKeys.map((a) => normalizePracticeAreaKey(String(a))).filter(Boolean))];
  } else {
    const { data: intake } = await supabase
      .from("lead_intakes")
      .select("areas_analise")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    const rawAreas = Array.isArray(intake?.areas_analise) ? intake!.areas_analise : [];
    areas = [...new Set(rawAreas.map((a) => normalizePracticeAreaKey(String(a))).filter(Boolean))];
  }
  const prazo = new Date(Date.now() + REVIEW_PRAZO_HORAS_DEFAULT * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  for (const area of areas) {
    const { data: existing } = await supabase
      .from("due_area_review_tasks")
      .select("id")
      .eq("oportunidade_id", oportunidadeId)
      .eq("revision_cycle", revisionCycle)
      .eq("area_key", area)
      .maybeSingle();
    if (existing?.id) continue;

    const responsavelId = await findDueAreaResponsibleAppUserId(supabase, area);
    await supabase.from("due_area_review_tasks").insert({
      oportunidade_id: oportunidadeId,
      revision_cycle: revisionCycle,
      area_key: area,
      responsavel_app_user_id: responsavelId,
      prazo_ate: prazo,
      status: "pendente",
      observacao_ajustes: null,
      review_started_at: now,
      responded_at: null,
      responded_by_app_user_id: null,
      notificado_em: null,
      email_enviado_em: null,
      whatsapp_enviado_em: null,
      ultimo_erro_canais: null,
      updated_at: now,
    });
  }
}

export async function allDueReviewTasksApprovedForCycle(
  supabase: SupabaseClient,
  oportunidadeId: string,
  revisionCycle: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("due_area_review_tasks")
    .select("area_key, status, revision_cycle")
    .eq("oportunidade_id", oportunidadeId);
  return isDueReviewApprovedForCycle(data ?? [], revisionCycle);
}

export async function notifyDueReviewAreas(
  supabase: SupabaseClient,
  oportunidadeId: string,
  revisionCycle: number,
  originadoPor?: InAppNotificationActor | null,
  areaKeys?: string[],
): Promise<void> {
  const { data: op } = await supabase
    .from("oportunidades")
    .select("solicitante_nome")
    .eq("id", oportunidadeId)
    .maybeSingle();
  let pendingQuery = supabase
    .from("due_area_review_tasks")
    .select("id, area_key, responsavel_app_user_id, prazo_ate")
    .eq("oportunidade_id", oportunidadeId)
    .eq("revision_cycle", revisionCycle)
    .is("notificado_em", null);
  if (Array.isArray(areaKeys) && areaKeys.length > 0) {
    pendingQuery = pendingQuery.in("area_key", areaKeys);
  }
  const { data: pending } = await pendingQuery;

  if (!op || !pending?.length) return;

  const leadPath = `/crm/leads/${oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const link = appUrl ? `${appUrl}${leadPath}` : leadPath;
  // WhatsApp: uma mensagem do ciclo com todas as áreas, montada depois do laço (sino e e-mail seguem por pessoa).
  const revisores: RevisorDaArea[] = [];

  for (const row of pending) {
    const now = new Date().toISOString();
    if (!row.responsavel_app_user_id) {
      revisores.push({ area: String(row.area_key), responsavel: null });
      const aviso = await notifyDueAreaWithoutResponsible(supabase, {
        oportunidadeId,
        leadName: String(op.solicitante_nome ?? "-"),
        areaKey: row.area_key,
        etapa: "revisao",
        leadPath,
        originadoPor,
      });
      await supabase
        .from("due_area_review_tasks")
        .update({ notificado_em: now, ultimo_erro_canais: aviso, updated_at: now })
        .eq("id", row.id);
      continue;
    }

    const { data: user } = await supabase
      .from("app_users")
      .select("auth_user_id, full_name")
      .eq("id", row.responsavel_app_user_id)
      .maybeSingle();

    let emailOk = false;
    let errMsg: string | null = null;
    revisores.push({ area: String(row.area_key), responsavel: user?.full_name?.trim() || null });

    if (user?.auth_user_id) {
      const title = `Revisar DUE - ${row.area_key}`;
      const bodyText = `A DUE de ${String(op.solicitante_nome ?? "-")} entrou em Revisão (ciclo ${revisionCycle}). Confira identificação do cliente, CNPJs, bases, valores, ações e fase processual.`;

      const { error: nInsErr } = await supabase.from("crm_in_app_notifications").insert({
        user_id: user.auth_user_id,
        tipo: "due_revisao_area",
        payload: {
          oportunidade_id: oportunidadeId,
          area_key: row.area_key,
          revision_cycle: revisionCycle,
          path: leadPath,
          link,
          title,
          ...(originadoPor ? { originado_por: originadoPor } : {}),
        } as never,
      });
      if (nInsErr) errMsg = `in-app ${user.full_name}: ${nInsErr.message}`;

      const { data: authData } = await supabase.auth.admin.getUserById(user.auth_user_id);
      const email = authData.user?.email ?? null;
      if (email) {
        emailOk = await sendResendEmail(
          email,
          title,
          `<p>${bodyText}</p><p><a href="${link}">Abrir oportunidade no CRM</a></p>`,
        );
      }
    } else {
      errMsg = "Responsável sem auth_user_id.";
    }

    await supabase
      .from("due_area_review_tasks")
      .update({
        notificado_em: now,
        email_enviado_em: emailOk ? now : null,
        ultimo_erro_canais: errMsg,
        updated_at: now,
      })
      .eq("id", row.id);
  }

  const text = await buildWhatsappMessage(
    supabase,
    "due_revisao_inicio",
    buildRevisaoInicioValues({
      cliente: String(op.solicitante_nome ?? ""),
      ciclo: revisionCycle,
      prazoIso: (pending.find((row) => row.prazo_ate)?.prazo_ate as string | null | undefined) ?? null,
      revisores,
      link,
    }),
  );
  if (!text) return;
  const areasDoEnvio = revisores.map((r) => r.area).sort();
  const sent = await sendDueWhatsappOnce(supabase, {
    oportunidadeId,
    sourceId: `due-revisao-inicio:${revisionCycle}:${areasDoEnvio.join("|")}`,
    title: `WhatsApp: DUE em revisão (ciclo ${revisionCycle})`,
    text,
  });
  if (sent) {
    await supabase
      .from("due_area_review_tasks")
      .update({ whatsapp_enviado_em: new Date().toISOString() })
      .in(
        "id",
        pending.map((row) => row.id),
      );
  }
}

export async function notifyDueReviewResponseToCompilationOwner(
  supabase: SupabaseClient,
  input: {
    oportunidadeId: string;
    areaKey: string;
    revisionCycle: number;
    status: "ok" | "ajustes_solicitados";
    observacaoAjustes?: string | null;
    respondedByName?: string | null;
    originadoPor?: InAppNotificationActor | null;
  },
): Promise<{ whatsappSent: boolean; error: string | null }> {
  const { data: op } = await supabase
    .from("oportunidades")
    .select("solicitante_nome")
    .eq("id", input.oportunidadeId)
    .maybeSingle();
  const authId = await resolveLeonardoAuthUserId(supabase);
  if (!op || !authId) return { whatsappSent: false, error: "Compilador não encontrado." };

  const leadPath = `/crm/leads/${input.oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const link = appUrl ? `${appUrl}${leadPath}` : leadPath;
  const title =
    input.status === "ok"
      ? `Revisão aprovada - ${input.areaKey}`
      : `Ajustes solicitados - ${input.areaKey}`;
  const actionLine =
    input.status === "ok"
      ? "A área aprovou a DUE."
      : `A área solicitou ajustes.${input.observacaoAjustes ? ` Obs.: ${input.observacaoAjustes}` : ""}`;
  const preview = `${String(op.solicitante_nome ?? "-")} · Ciclo ${input.revisionCycle} · ${actionLine}`;

  const { error: nErr } = await supabase.from("crm_in_app_notifications").insert({
    user_id: authId,
    tipo: "due_revisao_resposta",
    payload: {
      oportunidade_id: input.oportunidadeId,
      area_key: input.areaKey,
      revision_cycle: input.revisionCycle,
      status: input.status,
      title,
      preview,
      path: leadPath,
      link,
      ...(input.observacaoAjustes ? { observacao_ajustes: input.observacaoAjustes } : {}),
      ...(input.respondedByName ? { responded_by_name: input.respondedByName } : {}),
      ...(input.originadoPor ? { originado_por: input.originadoPor } : {}),
    } as never,
  });

  // WhatsApp não sai por resposta: só o resultado do ciclo (`notifyDueReviewCycleResultWhatsapp`).
  return { whatsappSent: false, error: nErr ? nErr.message : null };
}

/**
 * WhatsApp da DUE com o resultado do ciclo de revisão, uma vez por ciclo: quando um pedido de ajuste devolve
 * a DUE para Compilação ou quando todas as áreas do ciclo responderam. Aprovação no meio do ciclo não manda nada.
 * Depois que a mensagem do ciclo saiu, uma área que pede ajuste (`areaKey`) gera um complemento curto; se a
 * mensagem do ciclo falhou, a próxima resposta tenta de novo, já com o estado atual.
 */
export async function notifyDueReviewCycleResultWhatsapp(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; revisionCycle: number; returnedToCompilacao: boolean; areaKey?: string | null },
): Promise<{ sent: boolean }> {
  const [{ data: op }, { data: rows }] = await Promise.all([
    supabase.from("oportunidades").select("solicitante_nome").eq("id", input.oportunidadeId).maybeSingle(),
    supabase
      .from("due_area_review_tasks")
      .select("area_key, status, revision_cycle, observacao_ajustes, responded_by_app_user_id")
      .eq("oportunidade_id", input.oportunidadeId)
      .order("area_key", { ascending: true }),
  ]);
  if (!op || !rows?.length) return { sent: false };

  const responderIds = [
    ...new Set(rows.map((row) => row.responded_by_app_user_id).filter((id): id is string => Boolean(id))),
  ];
  const nameById = new Map<string, string>();
  if (responderIds.length) {
    const { data: users } = await supabase.from("app_users").select("id, full_name").in("id", responderIds);
    for (const user of users ?? []) nameById.set(String(user.id), String(user.full_name ?? ""));
  }

  const reviewRows = rows.map((row) => ({
    area_key: row.area_key,
    status: row.status,
    revision_cycle: row.revision_cycle,
    observacao_ajustes: row.observacao_ajustes,
    respondido_por: row.responded_by_app_user_id ? nameById.get(String(row.responded_by_app_user_id)) ?? null : null,
  }));
  const leadPath = `/crm/leads/${input.oportunidadeId}`;
  const appUrl = getPublicAppUrl();
  const link = appUrl ? `${appUrl}${leadPath}` : leadPath;
  const resultSourceId = `due-revisao-resultado:${input.revisionCycle}`;
  const previous = await findWhatsappSend(supabase, { oportunidadeId: input.oportunidadeId, sourceId: resultSourceId });

  if (previous && !previous.failed) {
    // A mensagem do ciclo já saiu: só um complemento quando uma área pede ajuste depois dela.
    const ajuste = input.areaKey
      ? decideAjusteAdicional(reviewRows, input.revisionCycle, {
          areaKey: input.areaKey,
          sentCycleText: previous.text,
        })
      : null;
    if (!ajuste) return { sent: false };
    const text = await buildWhatsappMessage(
      supabase,
      "due_revisao_ajuste_adicional",
      buildRevisaoAjusteAdicionalValues({
        cliente: String(op.solicitante_nome ?? ""),
        ciclo: input.revisionCycle,
        row: ajuste,
        link,
      }),
    );
    if (!text) return { sent: false };
    const sent = await sendDueWhatsappOnce(supabase, {
      oportunidadeId: input.oportunidadeId,
      sourceId: `due-revisao-ajuste-adicional:${input.revisionCycle}:${input.areaKey}`,
      title: `WhatsApp: mais um ajuste na revisão da DUE (ciclo ${input.revisionCycle}, ${input.areaKey})`,
      text,
    });
    return { sent };
  }

  // Primeira mensagem do ciclo, ou nova tentativa da que falhou (se ela foi tentada, o ciclo já tinha terminado).
  const result = decideReviewCycleResult(reviewRows, input.revisionCycle, {
    returnedToCompilacao: input.returnedToCompilacao || previous !== null,
  });
  if (!result) return { sent: false };

  const text = await buildWhatsappMessage(
    supabase,
    result.kind === "aprovada" ? "due_revisao_aprovada" : "due_revisao_ajustes",
    buildRevisaoResultadoValues({
      cliente: String(op.solicitante_nome ?? ""),
      ciclo: input.revisionCycle,
      result,
      link,
    }),
  );
  if (!text) return { sent: false };
  const sent = await sendDueWhatsappOnce(supabase, {
    oportunidadeId: input.oportunidadeId,
    sourceId: resultSourceId,
    title:
      result.kind === "aprovada"
        ? `WhatsApp: DUE aprovada (ciclo ${input.revisionCycle})`
        : `WhatsApp: ajustes na revisão da DUE (ciclo ${input.revisionCycle})`,
    text,
  });
  return { sent };
}

export async function markDueReviewTasksReentry(
  supabase: SupabaseClient,
  oportunidadeId: string,
  previousRevisionCycle: number,
  nowIso: string,
): Promise<void> {
  if (previousRevisionCycle < 1) return;
  const { data: rows } = await supabase
    .from("due_area_review_tasks")
    .select("id, compilation_returned_at")
    .eq("oportunidade_id", oportunidadeId)
    .eq("revision_cycle", previousRevisionCycle)
    .eq("status", "ajustes_solicitados");

  for (const row of rows ?? []) {
    const compilationElapsed = elapsedMs(row.compilation_returned_at as string | null, nowIso);
    await supabase
      .from("due_area_review_tasks")
      .update({
        revisao_reentry_at: nowIso,
        compilation_elapsed_ms: compilationElapsed,
      })
      .eq("id", row.id);
  }
}
