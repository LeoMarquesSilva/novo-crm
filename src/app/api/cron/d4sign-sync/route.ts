/**
 * Sync do cofre, disparado pelo GitHub Actions a cada 5 minutos.
 * A rodada está em `runD4SignSyncRound` (`src/lib/d4sign/sync-round.ts`).
 */
import { NextRequest, NextResponse } from "next/server";
import { runD4SignSyncRound } from "@/lib/d4sign/sync-round";

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

  const result = await runD4SignSyncRound("github-actions");
  return NextResponse.json(result, { status: result.rateLimited ? 429 : 200 });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
