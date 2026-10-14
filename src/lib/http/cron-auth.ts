import { NextResponse } from "next/server";

import { verifySharedSecret } from "@/lib/webhooks/security";

/** Mínimo atual; subir para 32+ exige rotacionar o segredo na Vercel e no GitHub. */
export const MIN_CRON_SECRET_LENGTH = 8;

/** `Authorization: Bearer <segredo>` (Vercel Cron, GitHub Actions) ou `x-cron-secret`, timing-safe. */
export function isCronAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1] ?? null;
  if (verifySharedSecret(secret, bearer)) return true;
  return verifySharedSecret(secret, request.headers.get("x-cron-secret"));
}

/**
 * Autoriza um job agendado. Devolve a resposta de recusa (503 sem segredo configurado,
 * 401 com segredo errado) ou null quando pode seguir.
 */
export function authorizeCronRequest(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): NextResponse | null {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
    console.error(`[cron] CRON_SECRET ausente ou com menos de ${MIN_CRON_SECRET_LENGTH} caracteres.`);
    return NextResponse.json({ ok: false, error: "Job não configurado no servidor." }, { status: 503 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
