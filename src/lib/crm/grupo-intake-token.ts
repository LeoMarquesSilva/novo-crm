import { createHash, randomBytes } from "crypto";

export const GRUPO_INTAKE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
export const GRUPO_INTAKE_DEFAULT_TTL_DAYS = 30;
export const GRUPO_INTAKE_MAX_TTL_DAYS = 90;

export function createGrupoIntakeToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashGrupoIntakeToken(raw) };
}

export function hashGrupoIntakeToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isGrupoIntakeTokenFormat(raw: string): boolean {
  return GRUPO_INTAKE_TOKEN_PATTERN.test(raw);
}

export function grupoIntakeExpiresAt(days = GRUPO_INTAKE_DEFAULT_TTL_DAYS, now = new Date()): Date {
  const ttl = Math.min(GRUPO_INTAKE_MAX_TTL_DAYS, Math.max(1, Math.round(days)));
  return new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000);
}

export function carteiraIntakePublicBaseUrl(request: Request): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "";
  if (fromEnv) return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export function grupoIntakePublicPath(rawToken: string): string {
  return `/preencher/carteira/${encodeURIComponent(rawToken)}`;
}
