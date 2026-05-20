import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewLeadPayload } from "./new-lead-payload";
import { buildLeadNotificationEmailMessage } from "./build-lead-notification-email";
import {
  refreshMicrosoftMailAccessToken,
  sendMailAsMe,
} from "@/lib/microsoft-mail/delegated-graph-mail";

const OAUTH_ROW_ID = "default";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

async function getGraphAppOnlyToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

  if (!tenantId?.trim() || !clientId?.trim() || !clientSecret?.trim()) {
    throw new Error(
      "Credenciais Microsoft não configuradas (MICROSOFT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET).",
    );
  }

  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description ?? json.error ?? res.statusText;
    throw new Error(`Falha ao obter token Microsoft (${res.status}): ${msg}`);
  }
  return json.access_token;
}

async function sendOutlookEmailApplication(
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const fromEmail = process.env.OUTLOOK_FROM_EMAIL;
  if (!fromEmail?.trim()) return { ok: false, error: "OUTLOOK_FROM_EMAIL não configurado." };
  if (to.length === 0) return { ok: false, error: "Nenhum destinatário definido." };

  let token: string;
  try {
    token = await getGraphAppOnlyToken();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao obter token Microsoft." };
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail.trim())}/sendMail`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { ok: false, error: `Graph sendMail ${res.status}: ${text.slice(0, 300)}` };
  }

  return { ok: true };
}

async function sendOutlookEmailDelegated(
  supabase: SupabaseClient,
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (to.length === 0) return { ok: false, error: "Nenhum destinatário definido." };

  const { data: row, error } = await supabase
    .from("lead_email_microsoft_oauth")
    .select("refresh_token")
    .eq("id", OAUTH_ROW_ID)
    .maybeSingle();

  if (error || !row?.refresh_token?.trim()) {
    return { ok: false, error: error?.message ?? "OAuth Outlook não configurado." };
  }

  try {
    const refreshed = await refreshMicrosoftMailAccessToken(row.refresh_token.trim());
    if (refreshed.refresh_token) {
      await supabase
        .from("lead_email_microsoft_oauth")
        .update({
          refresh_token: refreshed.refresh_token,
          updated_at: new Date().toISOString(),
        })
        .eq("id", OAUTH_ROW_ID);
    }

    const sent = await sendMailAsMe({
      accessToken: refreshed.access_token,
      to,
      subject,
      html,
    });
    if (!sent.ok) {
      return {
        ok: false,
        error: `Graph /me/sendMail ${sent.status}: ${sent.body.slice(0, 300)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha no envio delegado." };
  }
}

async function sendOutlookEmail(
  supabase: SupabaseClient,
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: oauth } = await supabase
    .from("lead_email_microsoft_oauth")
    .select("id")
    .eq("id", OAUTH_ROW_ID)
    .maybeSingle();

  if (oauth) {
    return sendOutlookEmailDelegated(supabase, to, subject, html);
  }

  return sendOutlookEmailApplication(to, subject, html);
}

/**
 * Resolve destinatários combinando:
 *  1. Usuários do CRM com área correspondente às áreas do lead (via app_users + auth.users)
 *  2. Destinatários fixos da tabela lead_email_notification_config (fixed:due / fixed:sem_due)
 *  3. E-mail do solicitante do lead
 */
async function resolveRecipients(
  supabase: SupabaseClient,
  areas: string[],
  fixedKey: "fixed:due" | "fixed:sem_due",
  solicitanteEmail: string,
): Promise<string[]> {
  const emailSet = new Set<string>();

  const { data: appUsers } = await supabase
    .from("app_users")
    .select("area, auth_user_id")
    .in("area", areas);

  if (appUsers && appUsers.length > 0) {
    const authIds = appUsers.map((u) => u.auth_user_id).filter(Boolean) as string[];
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    for (const au of authUsers?.users ?? []) {
      if (authIds.includes(au.id) && au.email?.trim()) {
        emailSet.add(au.email.trim().toLowerCase());
      }
    }
  }

  const { data: fixedConfig } = await supabase
    .from("lead_email_notification_config")
    .select("recipients")
    .eq("key", fixedKey)
    .maybeSingle();

  for (const email of fixedConfig?.recipients ?? []) {
    if (email?.trim()) emailSet.add(email.trim().toLowerCase());
  }

  if (solicitanteEmail?.trim()) {
    emailSet.add(solicitanteEmail.trim().toLowerCase());
  }

  return Array.from(emailSet);
}

export type SendLeadNotificationEmailOptions = {
  /** Se definido, envia só para estes endereços (ex.: teste admin), ignorando resolução por área/fixo. */
  recipientEmailsOverride?: string[];
};

export async function sendLeadNotificationEmail(
  supabase: SupabaseClient,
  payload: NewLeadPayload,
  options?: SendLeadNotificationEmailOptions,
): Promise<{ ok: boolean; error?: string }> {
  const isDue = payload.due_diligence === "Sim";
  const fixedKey = isDue ? "fixed:due" : "fixed:sem_due";

  const variant = isDue ? "due" : "sem_due";
  const override = options?.recipientEmailsOverride?.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const [recipients, template] = await Promise.all([
    override?.length
      ? Promise.resolve(override)
      : resolveRecipients(supabase, payload.areas_analise as string[], fixedKey, payload.email),
    buildLeadNotificationEmailMessage(supabase, variant, payload),
  ]);

  return sendOutlookEmail(supabase, recipients, template.subject, template.html);
}
