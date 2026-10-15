/**
 * Importação manual das fases 2 e 3. Fora do `vercel.json`: a cota
 * horária ficou no `d4sign-sync` (raiz + pastas de cliente + signatários).
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";
import { runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";

export const maxDuration = 120;

async function run(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

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
