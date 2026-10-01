/**
 * Sync do cofre, disparado pelo GitHub Actions a cada 5 minutos.
 * A D4Sign limita 10 req/h por método; cada etapa usa só a cota livre do
 * seu método e deixa a reserva humana de `D4SIGN_HUMAN_RESERVE` intacta.
 * Etapas: uma página da raiz, fases 3 e 2 (pendentes em qualquer pasta),
 * signatários, pastas de cliente e pré-cache de 1 PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { peekPendingPhaseCursor, runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";
import { precacheD4SignPdfs } from "@/lib/d4sign/pdf-precache";
import { D4SIGN_HUMAN_RESERVE, planD4SignSyncBudget } from "@/lib/d4sign/sync-budget";
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

async function remainingByMethod() {
  const [safe, status, list, download] = await Promise.all([
    getD4SignQuotaStatus("documents/safe"),
    getD4SignQuotaStatus("documents/status"),
    getD4SignQuotaStatus("documents/list"),
    getD4SignQuotaStatus("documents/download"),
  ]);
  return {
    safe: safe.remaining,
    status: status.remaining,
    list: list.remaining,
    download: download.remaining,
  };
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

  const before = await remainingByMethod();
  const phaseCursor = await peekPendingPhaseCursor();
  const folderCursor = await peekVaultFolderWalk();
  const folderMode =
    !folderCursor.catalogued || foldersLeftInWalk(folderCursor) > 0
      ? "backlog"
      : folderCursor.folders.length > 0
        ? "rotate"
        : "none";
  const budget = planD4SignSyncBudget({
    remaining: before,
    phaseCycleOpen: phaseCursor !== "done",
    folderMode,
  });

  const nothingToDo = Object.values(budget).every((n) => n === 0);
  if (nothingToDo) {
    return NextResponse.json(
      {
        ok: false,
        triggeredAt: new Date().toISOString(),
        error: "Cota D4Sign do cron esgotada nesta hora (reserva humana preservada).",
        rateLimited: true,
        budget,
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

  const listing =
    budget.listing > 0
      ? await runVaultSafeListing({ maxRequests: budget.listing, apiSource: "cron" })
      : null;

  const phases =
    budget.phases > 0
      ? await runPendingSignatureBackfill({
          maxRequests: budget.phases,
          apiSource: "cron",
          refreshFirstPage: phaseCursor === "done",
        })
      : null;

  let enrich: Awaited<ReturnType<typeof enrichDocuments>> | null = null;
  if (budget.enrich > 0) {
    const env = getD4SignEnv();
    const rows = await pickDocumentsToEnrich({ limit: budget.enrich });
    if (rows.length > 0 && env.tokenApi) {
      enrich = await enrichDocuments(env, rows, { apiSource: "cron" });
    }
  }

  // Pastas dividem a cota com a listagem da raiz: recalcula depois dela.
  const safeLeft = Math.max(
    0,
    (await getD4SignQuotaStatus("documents/safe")).remaining - D4SIGN_HUMAN_RESERVE.safe,
  );
  const folderBudget = Math.min(budget.folders, safeLeft);
  const folders =
    listing?.rateLimited !== true && folderBudget > 0
      ? await runVaultFolderWalk({ maxRequests: folderBudget, apiSource: "cron" })
      : null;

  let precache = { cached: 0, skipped: 0 };
  if (budget.precache > 0) {
    const supabase = createSupabaseAdminClient();
    const { data: candidates } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc")
      // Só finalizado: o PDF de pendente muda a cada assinatura.
      .eq("d4sign_status", "1")
      .order("created_at_d4sign", { ascending: false, nullsFirst: false })
      .limit(10);
    const uuids = (candidates ?? []).map((row) => row.uuid_doc);
    if (uuids.length > 0) {
      precache = await precacheD4SignPdfs(uuids, { maxDownloads: budget.precache });
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
    quota: await remainingByMethod(),
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
