import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmModule, CrmRole } from "@/lib/auth/crm-access-policy";
import { fetchLeadStakeholderContext } from "@/lib/crm/notify-lead-stakeholders";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { isPartnerOnlyEmail, PARTNER_HOME } from "@/lib/d4sign/partner-only";
import { getPublicAppBaseUrl } from "@/lib/microsoft-mail/public-app-base-url";
import { sendCrmNotificationEmail } from "@/modules/crm/application/services/send-lead-notification-email";

/**
 * Quem recebe um aviso. As fontes se somam e o resultado é deduplicado por usuário.
 * Admin NÃO entra implicitamente em `modules` (só membros explícitos do time).
 */
export type NotificationAudience = {
  roles?: readonly CrmRole[];
  modules?: readonly CrmModule[];
  appUserIds?: readonly (string | null | undefined)[];
  emails?: readonly (string | null | undefined)[];
  /** Equipe do lead: criador, captador, cadastrado por, dono no RD, responsáveis DUE/escopo/revisão. */
  leadTeamOf?: string;
  /** Sócios signatários (Gustavo e Ricardo, com aliases). */
  firmPartners?: boolean;
};

export type NotificationRecipient = {
  authUserId: string;
  email: string | null;
  /** Sócio no modo "só Assinar Contratos": o link do aviso vai para lá. */
  partnerOnly: boolean;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const v = email?.trim().toLowerCase();
  return v && v.includes("@") ? v : null;
}

/** app_users.id de quem trabalhou no lead (DUE, escopo da proposta, revisão do contrato). */
export async function resolveLeadTeamAppUserIds(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<string[]> {
  const [{ data: opp }, { data: dueTasks }, { data: dueReviews }, { data: scopes }, { data: review }] =
    await Promise.all([
      supabase.from("oportunidades").select("criado_por").eq("id", oportunidadeId).maybeSingle(),
      supabase.from("due_area_tasks").select("responsavel_app_user_id").eq("oportunidade_id", oportunidadeId),
      supabase
        .from("due_area_review_tasks")
        .select("responsavel_app_user_id")
        .eq("oportunidade_id", oportunidadeId),
      supabase
        .from("proposta_escopo_solicitacao")
        .select("gestor_app_user_id, preenchido_por_app_user_id")
        .eq("oportunidade_id", oportunidadeId),
      supabase.from("contract_review_tasks").select("assigned_to").eq("oportunidade_id", oportunidadeId).maybeSingle(),
    ]);

  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v) ids.add(v);
  };
  add(opp?.criado_por);
  for (const row of (dueTasks ?? []) as { responsavel_app_user_id: string | null }[]) add(row.responsavel_app_user_id);
  for (const row of (dueReviews ?? []) as { responsavel_app_user_id: string | null }[]) add(row.responsavel_app_user_id);
  for (const row of (scopes ?? []) as { gestor_app_user_id: string | null; preenchido_por_app_user_id: string | null }[]) {
    add(row.gestor_app_user_id);
    add(row.preenchido_por_app_user_id);
  }
  add((review as { assigned_to?: string | null } | null)?.assigned_to);
  return [...ids];
}

function firmPartnerEmails(): string[] {
  const out: string[] = [];
  for (const signer of getFirmSigners()) {
    for (const email of [signer.email, ...(signer.aliases ?? [])]) {
      const e = normalizeEmail(email);
      if (e && isPartnerOnlyEmail(e)) out.push(e);
    }
  }
  return out;
}

export async function resolveNotificationRecipients(
  supabase: SupabaseClient,
  audience: NotificationAudience,
): Promise<NotificationRecipient[]> {
  const appUserIds = new Set<string>();
  const emails = new Set<string>();
  for (const id of audience.appUserIds ?? []) if (id) appUserIds.add(id);
  for (const email of audience.emails ?? []) {
    const e = normalizeEmail(email);
    if (e) emails.add(e);
  }

  if (audience.roles?.length) {
    const { data } = await supabase.from("app_users").select("id").in("role", [...audience.roles]);
    for (const row of (data ?? []) as { id: string }[]) appUserIds.add(row.id);
  }

  if (audience.modules?.length) {
    const { data } = await supabase
      .from("app_user_module_access")
      .select("app_user_id")
      .in("module", [...audience.modules]);
    for (const row of (data ?? []) as { app_user_id: string }[]) appUserIds.add(row.app_user_id);
  }

  if (audience.leadTeamOf) {
    for (const id of await resolveLeadTeamAppUserIds(supabase, audience.leadTeamOf)) appUserIds.add(id);
    const ctx = await fetchLeadStakeholderContext(supabase, audience.leadTeamOf);
    for (const email of [ctx.solicitanteEmail, ctx.cadastradoPorEmail, ctx.rdOwnerEmail]) {
      if (email) emails.add(email);
    }
  }

  if (audience.firmPartners) {
    for (const email of firmPartnerEmails()) emails.add(email);
  }

  const authIds = new Set<string>();
  if (appUserIds.size > 0) {
    const { data } = await supabase
      .from("app_users")
      .select("auth_user_id")
      .in("id", [...appUserIds])
      .not("auth_user_id", "is", null);
    for (const row of (data ?? []) as { auth_user_id: string | null }[]) {
      if (row.auth_user_id) authIds.add(row.auth_user_id);
    }
  }

  // Um só listUsers resolve e-mail → login e login → e-mail (para o aviso por e-mail).
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailByAuthId = new Map<string, string | null>();
  for (const user of authList?.users ?? []) {
    const mail = normalizeEmail(user.email);
    emailByAuthId.set(user.id, mail);
    if (mail && emails.has(mail)) authIds.add(user.id);
  }

  return [...authIds].map((authUserId) => {
    const email = emailByAuthId.get(authUserId) ?? null;
    return { authUserId, email, partnerOnly: isPartnerOnlyEmail(email) };
  });
}

export type NotificationContent = {
  tipo: string;
  title: string;
  preview: string;
  /** Link do aviso (ex.: `/crm/leads/{id}?tab=onboarding`). Sócio no modo sócio vai para Assinar Contratos. */
  path: string;
  /** Mesmo valor para o mesmo evento: o índice único (user_id, idempotency_key) evita duplicar. */
  idempotencyKey: string;
  extra?: Record<string, unknown>;
};

/** Aviso no sino do CRM, idempotente por usuário + chave. */
export async function notifyInApp(
  supabase: SupabaseClient,
  recipients: readonly NotificationRecipient[],
  content: NotificationContent,
): Promise<void> {
  if (recipients.length === 0) return;
  const rows = recipients.map((r) => ({
    user_id: r.authUserId,
    tipo: content.tipo,
    idempotency_key: content.idempotencyKey,
    payload: {
      title: content.title,
      preview: content.preview,
      path: r.partnerOnly ? PARTNER_HOME : content.path,
      idempotency_key: content.idempotencyKey,
      ...(content.extra ?? {}),
    },
  }));
  const { error } = await supabase
    .from("crm_in_app_notifications")
    .upsert(rows as never, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
  if (error) console.warn(`[crm-notify] aviso ${content.tipo} não gravado:`, error.message);
}

export function isNotificationEmailEnabled(): boolean {
  const flag = process.env.CRM_NOTIFY_EMAIL_ENABLED?.trim().toLowerCase();
  return !(flag === "0" || flag === "false" || flag === "no");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildNotificationEmailHtml(content: Pick<NotificationContent, "title" | "preview" | "path">): string {
  const link = `${getPublicAppBaseUrl().replace(/\/$/, "")}${content.path}`;
  return [
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#101828;line-height:1.5">`,
    `<p style="font-size:16px;font-weight:bold;margin:0 0 8px">${escapeHtml(content.title)}</p>`,
    `<p style="margin:0 0 16px">${escapeHtml(content.preview)}</p>`,
    `<p style="margin:0"><a href="${escapeHtml(link)}" style="color:#175cd3">Abrir no CRM</a></p>`,
    `</div>`,
  ].join("");
}

/** Aviso por e-mail (Outlook do CRM). Falha não interrompe o fluxo: só registra no log. */
export async function notifyByEmail(
  supabase: SupabaseClient,
  recipients: readonly NotificationRecipient[],
  content: Pick<NotificationContent, "title" | "preview" | "path">,
): Promise<void> {
  if (!isNotificationEmailEnabled()) return;
  const to = [...new Set(recipients.map((r) => r.email).filter((e): e is string => Boolean(e)))];
  if (to.length === 0) return;
  try {
    const result = await sendCrmNotificationEmail(supabase, {
      to,
      subject: `[CRM] ${content.title}`,
      html: buildNotificationEmailHtml(content),
    });
    if (!result.ok) console.warn("[crm-notify] e-mail não enviado:", result.error);
  } catch (error) {
    console.warn("[crm-notify] e-mail não enviado:", error instanceof Error ? error.message : error);
  }
}

/** Sino + e-mail para a mesma audiência. */
export async function notifyAudience(
  supabase: SupabaseClient,
  audience: NotificationAudience,
  content: NotificationContent,
  options: { email?: boolean } = {},
): Promise<NotificationRecipient[]> {
  const recipients = await resolveNotificationRecipients(supabase, audience);
  await notifyInApp(supabase, recipients, content);
  if (options.email !== false) await notifyByEmail(supabase, recipients, content);
  return recipients;
}
