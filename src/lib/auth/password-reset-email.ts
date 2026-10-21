import { RECOVERY_CONFIRM_PATH } from "@/lib/auth/password-recovery";

/** Validade do link: `mailer_otp_exp` do Supabase Auth (3600 s). */
export const PASSWORD_RESET_LINK_MINUTES = 60;

export const PASSWORD_RESET_EMAIL_SUBJECT = "Redefinição de senha · CRM Bismarchi | Pires";

const NAVY = "#0D1E2E";
const GOLD = "#D4B070";
const GOLD_TEXT = "#8A6A2F";
const INK = "#344054";
const MUTED = "#667085";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * O link leva a uma página com botão (não abre a sessão no GET): filtros de link
 * do Outlook/Defender abrem a URL antes do usuário e gastariam o token de uso único.
 */
export function buildPasswordResetLink(appBaseUrl: string, hashedToken: string): string {
  const url = new URL(RECOVERY_CONFIRM_PATH, `${appBaseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export function firstNameFrom(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** E-mail com a identidade do escritório (tabelas e CSS inline, para Outlook/Gmail). */
export function buildPasswordResetEmailHtml(input: {
  firstName: string | null;
  link: string;
  appBaseUrl: string;
}): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  const link = escapeHtml(input.link);
  const greeting = input.firstName ? `Olá, ${escapeHtml(input.firstName)}` : "Olá";
  const logo = escapeHtml(`${base}/brand/logo-bismarchi-pires-claro.png`);
  const font = "'Segoe UI',Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(PASSWORD_RESET_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F1EC;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4F1EC;">Use o link para criar uma nova senha no CRM. Ele vale por 1 hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F1EC;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
<tr><td style="background-color:${NAVY};padding:28px 40px;border-bottom:3px solid ${GOLD};">
<img src="${logo}" width="220" alt="Bismarchi | Pires Sociedade de Advogados" style="display:block;width:220px;max-width:100%;height:auto;border:0;color:#FFFFFF;font-family:${font};font-size:16px;font-weight:bold;">
</td></tr>
<tr><td style="padding:40px 40px 8px;font-family:${font};">
<p style="margin:0 0 12px;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${GOLD_TEXT};font-weight:600;">CRM · Redefinição de senha</p>
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:normal;color:${NAVY};">${greeting}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">Recebemos um pedido para redefinir a senha da sua conta no CRM do escritório. Para criar uma nova senha, clique no botão abaixo.</p>
</td></tr>
<tr><td align="left" style="padding:12px 40px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${NAVY}" style="border-radius:8px;background-color:${NAVY};">
<a href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">Criar nova senha</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px;font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FCF9F5;border-left:3px solid ${GOLD};border-radius:4px;">
<tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;color:${INK};">
O link vale por <strong>${PASSWORD_RESET_LINK_MINUTES / 60} hora</strong> e só pode ser usado uma vez.<br>
Se não foi você quem pediu, ignore este e-mail: sua senha atual continua valendo.
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 40px 36px;font-family:${font};">
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${NAVY};text-decoration:underline;">${link}</a></p>
</td></tr>
<tr><td style="padding:22px 40px;border-top:1px solid #EAECF0;font-family:${font};font-size:12px;line-height:1.6;color:${MUTED};">
<strong style="color:${NAVY};">Bismarchi | Pires Sociedade de Advogados</strong><br>
Rua Coronel Quirino, 1266 · Cambuí · Campinas/SP<br>
(19) 3254-6446 · <a href="https://www.bismarchipires.com.br" target="_blank" style="color:${MUTED};text-decoration:underline;">bismarchipires.com.br</a>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${font};font-size:11px;color:#98A2B3;">Mensagem automática do CRM. Não responda a este e-mail.</p>
</td></tr>
</table>
</body>
</html>`;
}
