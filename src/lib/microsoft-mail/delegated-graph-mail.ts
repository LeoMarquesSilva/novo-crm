/**
 * OAuth2 delegado Microsoft (authorization code + refresh_token) — mesmo modelo que n8n com conta de utilizador.
 * Requer no registo Azure AD: permissões delegadas Mail.Send, offline_access, openid + redirect URI Web.
 */

const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Send offline_access openid";

interface TokenJson {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function tenantClient(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim();
  const clientId = process.env.SHAREPOINT_CLIENT_ID?.trim();
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MICROSOFT_TENANT_ID, SHAREPOINT_CLIENT_ID e SHAREPOINT_CLIENT_SECRET são obrigatórios.");
  }
  return { tenantId, clientId, clientSecret };
}

export function buildMicrosoftMailAuthorizeUrl(params: {
  state: string;
  redirectUri: string;
}): string {
  const { tenantId, clientId } = tenantClient();
  const u = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
  );
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", GRAPH_SCOPE);
  u.searchParams.set("state", params.state);
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

export async function exchangeMicrosoftMailAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const { tenantId, clientId, clientSecret } = tenantClient();
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenJson;
  if (!res.ok || !json.access_token || !json.refresh_token) {
    const msg = json.error_description ?? json.error ?? res.statusText;
    throw new Error(`Troca de código OAuth falhou (${res.status}): ${msg}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in ?? 3600,
  };
}

export async function refreshMicrosoftMailAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const { tenantId, clientId, clientSecret } = tenantClient();
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPE,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenJson;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description ?? json.error ?? res.statusText;
    throw new Error(`Refresh token Outlook falhou (${res.status}): ${msg}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in ?? 3600,
  };
}

export async function fetchGraphMeEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return (me.mail || me.userPrincipalName || null)?.trim() || null;
}

export async function sendMailAsMe(params: {
  accessToken: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "HTML", content: params.html },
        toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { ok: false, status: res.status, body: text.slice(0, 500) };
  }
  return { ok: true };
}
