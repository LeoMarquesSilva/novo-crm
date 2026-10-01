/**
 * Sync do cofre, disparado pelo GitHub Actions a cada 5 minutos.
 * Usa só a cota que já estiver livre (janela móvel de 10 req/h).
 * Uma página da raiz, depois as fases 3 e 2 (pendentes em qualquer pasta).
 * Com o ciclo de fases fechado, signatários dos pendentes mais recentes.
 * Pasta de cliente entra quando não há pendente sem signatário.
 */
import { NextRequest, NextResponse } from "next/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import {
  countPendingDocumentsNeedingEnrich,
  enrichDocuments,
  pickDocumentsToEnrich,
} from "@/lib/d4sign/enrich-documents";
import { peekPendingPhaseCursor, runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";
import { precacheD4SignPdfs } from "@/lib/d4sign/pdf-precache";
import { planD4SignSyncBudget } from "@/lib/d4sign/sync-budget";
import { peekVaultFolderWalk, runVaultFolderWalk } from "@/lib/d4sign/vault-folder-walk";
import { foldersLeftInWalk } from "@/lib/d4sign/vault-folder-walk-plan";
import { runVaultSafeListing } from "@/lib/d4sign/vault-listing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

/** O log da chamada é assíncrono; usa o menor entre o banco e a conta local. */
function callsLeft(reported: number, accounted: number): number {
  return Math.min(reported, Math.max(0, accounted));
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

  const before = await getD4SignQuotaStatus();
  if (before.remaining < 1) {
    return NextResponse.json(
      {
        ok: false,
        triggeredAt: new Date().toISOString(),
        error: "Quota D4Sign esgotada.",
        rateLimited: true,
        quota: before,
        listing: null,
        phases: null,
        folders: null,
        enrich: null,
        precache: { cached: 0, skipped: 0 },
      },
      { status: 429 },
    );
  }

  const phaseCursor = await peekPendingPhaseCursor();
  const folderCursor = await peekVaultFolderWalk();
  const pendingWithoutSigners = await countPendingDocumentsNeedingEnrich();
  const folderMode =
    !folderCursor.catalogued || foldersLeftInWalk(folderCursor) > 0
      ? "backlog"
      : folderCursor.folders.length > 0
        ? "rotate"
        : "none";
  const budget = planD4SignSyncBudget({
    remaining: before.remaining,
    phaseCycleOpen: phaseCursor !== "done",
    pendingWithoutSigners,
    folderMode,
  });

  const listing =
    budget.listing > 0
      ? await runVaultSafeListing({ maxRequests: budget.listing, apiSource: "cron" })
      : null;
  let left = callsLeft(
    (await getD4SignQuotaStatus()).remaining,
    before.remaining - (listing?.requests ?? 0),
  );

  const phases =
    listing?.ok !== false && Math.min(budget.phases, left) > 0
      ? await runPendingSignatureBackfill({
          maxRequests: Math.min(budget.phases, left),
          apiSource: "cron",
          refreshFirstPage: phaseCursor === "done",
        })
      : null;
  left = callsLeft((await getD4SignQuotaStatus()).remaining, left - (phases?.requests ?? 0));

  let enrichPlanned = budget.enrich;
  let foldersPlanned = budget.folders;
  if (
    listing?.ok !== false &&
    phases?.ok !== false &&
    phases?.finishedCycle &&
    left > 0 &&
    enrichPlanned === 0 &&
    foldersPlanned === 0
  ) {
    const stillPending = await countPendingDocumentsNeedingEnrich();
    if (stillPending > 0) enrichPlanned = left;
    else if (folderMode === "rotate") foldersPlanned = Math.min(1, left);
    else if (folderMode === "backlog") foldersPlanned = left;
  }

  const enrichBudget = listing?.ok !== false && phases?.ok !== false ? Math.min(enrichPlanned, left) : 0;
  let enrich: Awaited<ReturnType<typeof enrichDocuments>> | null = null;
  let picked = 0;
  if (enrichBudget > 0) {
    const env = getD4SignEnv();
    const rows = await pickDocumentsToEnrich({ limit: enrichBudget });
    picked = rows.length;
    if (rows.length > 0 && env.tokenApi) {
      enrich = await enrichDocuments(env, rows, { apiSource: "cron" });
    }
  }
  left = callsLeft((await getD4SignQuotaStatus()).remaining, left - (enrich?.enriched ?? 0));

  const folders =
    listing?.ok !== false && phases?.ok !== false && Math.min(foldersPlanned, left) > 0
      ? await runVaultFolderWalk({
          maxRequests: Math.min(foldersPlanned, left),
          apiSource: "cron",
        })
      : null;

  let precache = { cached: 0, skipped: 0 };
  const leftForPrecache = callsLeft(
    (await getD4SignQuotaStatus()).remaining,
    left - (folders?.requests ?? 0),
  );
  if (
    listing?.ok !== false &&
    phases?.ok !== false &&
    folders?.ok !== false &&
    foldersPlanned === 0 &&
    leftForPrecache >= 1 &&
    picked < enrichBudget
  ) {
    const supabase = createSupabaseAdminClient();
    const { data: candidates } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc")
      .in("d4sign_status", ["1", "3", "sent", "2"])
      .order("created_at_d4sign", { ascending: false, nullsFirst: false })
      .limit(1);
    const uuids = (candidates ?? []).map((row) => row.uuid_doc);
    if (uuids.length > 0) {
      precache = await precacheD4SignPdfs(uuids);
    }
  }

  const ok = listing?.ok !== false && phases?.ok !== false && folders?.ok !== false;
  return NextResponse.json({
    ok,
    triggeredAt: new Date().toISOString(),
    budget,
    listing,
    phases,
    folders,
    enrich,
    precache,
    quota: await getD4SignQuotaStatus(),
  });
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
