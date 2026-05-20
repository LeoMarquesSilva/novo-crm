/** URL pública do CRM (OAuth redirect, links absolutos). */
export function getPublicAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "";
  if (!raw) {
    throw new Error(
      "Defina NEXT_PUBLIC_APP_URL com a URL base do CRM (ex.: https://crm.seudominio.com ou http://localhost:3000) para OAuth do Outlook.",
    );
  }
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export function getMicrosoftMailOAuthCallbackUrl(): string {
  return `${getPublicAppBaseUrl()}/api/admin/microsoft-mail/oauth/callback`;
}
