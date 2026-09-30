/**
 * Importação manual das fases 2 e 3. Fora do `vercel.json`: a cota
 * horária ficou no `d4sign-sync` (raiz + pastas de cliente + signatários).
 */
import { NextRequest, NextResponse } from "next/server";
import { runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";

export const maxDuration = 120;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET ausente ou fraco." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const result = await runPendingSignatureBackfill();
  return NextResponse.json(
    { ...result, triggeredAt: new Date().toISOString() },
    { status: result.ok ? 200 : result.rateLimited ? 429 : 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no backfill D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no backfill D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
