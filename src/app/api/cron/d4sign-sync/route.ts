/**
 * Sync do cofre, disparado pelo GitHub Actions a cada 5 minutos.
 * A rodada está em `runD4SignSyncRound` (`src/lib/d4sign/sync-round.ts`).
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";
import { runD4SignSyncRound } from "@/lib/d4sign/sync-round";

/** Cada PDF baixado para ler o remetente leva ~30s; ver SYNC_ROUND_BUDGET_MS. */
export const maxDuration = 300;

async function run(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

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
