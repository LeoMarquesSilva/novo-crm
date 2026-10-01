/**
 * Uma rodada do sync D4Sign: fases (conta inteira), signatários, raiz,
 * pastas de cliente e pré-cache de 1 PDF — cada etapa com a cota livre do
 * seu método, sem invadir `D4SIGN_HUMAN_RESERVE`.
 *
 * Disparada pelo GitHub Actions (`/api/cron/d4sign-sync`) e, como reforço,
 * pelo layout do CRM quando a última rodada tem mais de
 * `SYNC_ROUND_MIN_INTERVAL_MS` — o agendamento do GitHub atrasa ou pula
 * execuções. A marca da última rodada fica em `d4sign_api_usage`
 * (`cursor/sync-round`, `http_status` nulo, fora da cota).
 */
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";
import { precacheD4SignPdfs } from "@/lib/d4sign/pdf-precache";
import { D4SIGN_HUMAN_RESERVE, planD4SignSyncBudget } from "@/lib/d4sign/sync-budget";
import { peekVaultFolderWalk, runVaultFolderWalk } from "@/lib/d4sign/vault-folder-walk";
import { foldersLeftInWalk } from "@/lib/d4sign/vault-folder-walk-plan";
import { runVaultSafeListing } from "@/lib/d4sign/vault-listing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const SYNC_ROUND_ENDPOINT = "cursor/sync-round";
export const SYNC_ROUND_MIN_INTERVAL_MS = 4 * 60 * 1000;

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

async function lastRoundAt(): Promise<number | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("d4sign_api_usage")
    .select("created_at")
    .eq("endpoint", SYNC_ROUND_ENDPOINT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at).getTime() : null;
}

async function markRound(trigger: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("d4sign_api_usage").insert({
    endpoint: SYNC_ROUND_ENDPOINT,
    method: "GET",
    source: trigger,
    http_status: null,
  });
}

export async function runD4SignSyncRound(trigger: string) {
  await markRound(trigger);

  const before = await remainingByMethod();
  const folderCursor = await peekVaultFolderWalk();
  const folderMode =
    !folderCursor.catalogued || foldersLeftInWalk(folderCursor) > 0
      ? "backlog"
      : folderCursor.folders.length > 0
        ? "rotate"
        : "none";
  const budget = planD4SignSyncBudget({ remaining: before, folderMode });

  if (Object.values(budget).every((n) => n === 0)) {
    return {
      ok: false,
      rateLimited: true,
      error: "Cota D4Sign do sync esgotada nesta hora (reserva humana preservada).",
      triggeredAt: new Date().toISOString(),
      trigger,
      budget,
      quota: before,
      listing: null,
      phases: null,
      folders: null,
      enrich: null,
      precache: { cached: 0, skipped: 0 },
    };
  }

  // Fases primeiro: trazem documentos novos e mudança de status de qualquer
  // pasta, e alimentam a fila de signatários desta mesma rodada.
  const phases =
    budget.phases > 0
      ? await runPendingSignatureBackfill({ maxRequests: budget.phases, apiSource: "cron" })
      : null;

  let enrich: Awaited<ReturnType<typeof enrichDocuments>> | null = null;
  if (budget.enrich > 0) {
    const env = getD4SignEnv();
    const rows = await pickDocumentsToEnrich({ limit: budget.enrich });
    if (rows.length > 0 && env.tokenApi) {
      enrich = await enrichDocuments(env, rows, { apiSource: "cron" });
    }
  }

  const listing =
    budget.listing > 0
      ? await runVaultSafeListing({ maxRequests: budget.listing, apiSource: "cron" })
      : null;

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

  let precache: Awaited<ReturnType<typeof precacheD4SignPdfs>> = { cached: 0, skipped: 0 };
  if (budget.precache > 0) {
    const supabase = createSupabaseAdminClient();
    const { data: candidates } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc")
      // Só finalizado: o PDF de pendente muda a cada assinatura.
      .eq("d4sign_status", "1")
      .order("created_at_d4sign", { ascending: false, nullsFirst: false })
      .order("name_document", { ascending: false, nullsFirst: false })
      .limit(10);
    const uuids = (candidates ?? []).map((row) => row.uuid_doc);
    if (uuids.length > 0) {
      precache = await precacheD4SignPdfs(uuids, { maxDownloads: budget.precache });
    }
  }

  return {
    ok: listing?.ok !== false && phases?.ok !== false && folders?.ok !== false,
    triggeredAt: new Date().toISOString(),
    trigger,
    budget,
    phases,
    enrich,
    listing,
    folders,
    precache,
    quota: await remainingByMethod(),
  };
}

/**
 * Roda uma rodada se a última tiver mais de `SYNC_ROUND_MIN_INTERVAL_MS`.
 * Para chamar dentro de `after()`: nunca lança.
 */
export async function runD4SignSyncRoundIfStale(trigger: string): Promise<void> {
  try {
    const env = getD4SignEnv();
    if (!env.tokenApi || !env.safeUuid) return;
    const last = await lastRoundAt();
    if (last !== null && Date.now() - last < SYNC_ROUND_MIN_INTERVAL_MS) return;
    await runD4SignSyncRound(trigger);
  } catch (error) {
    console.error("[D4Sign] rodada de sync em segundo plano falhou", error);
  }
}
