/**
 * Uma rodada do sync D4Sign: garante o Webhook 2.0 no cofre (uma vez), fases
 * (conta inteira), signatários, raiz,
 * pastas de cliente e remetente pelo log do PDF — cada etapa com a cota livre do
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
import { collectD4SignPdfLogs } from "@/lib/d4sign/pdf-log-sync";
import { D4SIGN_HUMAN_RESERVE, planD4SignSyncBudget } from "@/lib/d4sign/sync-budget";
import { peekVaultFolderWalk, runVaultFolderWalk } from "@/lib/d4sign/vault-folder-walk";
import { foldersLeftInWalk } from "@/lib/d4sign/vault-folder-walk-plan";
import { runVaultSafeListing } from "@/lib/d4sign/vault-listing";
import { ensureSafeWebhookV2 } from "@/lib/d4sign/webhook-registration";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const SYNC_ROUND_ENDPOINT = "cursor/sync-round";
export const SYNC_ROUND_MIN_INTERVAL_MS = 4 * 60 * 1000;

/**
 * Tempo da rodada, abaixo do `maxDuration` (300s) da rota do cron e do layout.
 * As etapas antes do remetente levam 50–70s e cada PDF baixado ~30s; com
 * 120s a Vercel respondia 504 e, com orçamento de 95s, só cabia 1 PDF.
 */
export const SYNC_ROUND_BUDGET_MS = 260_000;

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
  const deadline = Date.now() + SYNC_ROUND_BUDGET_MS;
  await markRound(trigger);
  // Uma vez só (marcado em cursor/webhook-v2): eventos em tempo real do cofre.
  const webhook = await ensureSafeWebhookV2();

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
      webhook,
      budget,
      quota: before,
      listing: null,
      phases: null,
      folders: null,
      enrich: null,
      pdfLogs: null,
    };
  }

  // Cada etapa é isolada: erro de uma (ex.: 500 da D4Sign) não impede as outras.
  const errors: string[] = [];
  async function stage<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${name}: ${message}`);
      console.error(`[D4Sign] etapa ${name} do sync falhou`, message);
      return null;
    }
  }

  // Fases primeiro: trazem documentos novos e mudança de status de qualquer
  // pasta, e alimentam a fila de signatários desta mesma rodada.
  const phases =
    budget.phases > 0
      ? await stage("fases", () =>
          runPendingSignatureBackfill({ maxRequests: budget.phases, apiSource: "cron" }),
        )
      : null;

  const enrich =
    budget.enrich > 0
      ? await stage("signatários", async () => {
          const env = getD4SignEnv();
          const rows = await pickDocumentsToEnrich({ limit: budget.enrich });
          return rows.length > 0 && env.tokenApi
            ? enrichDocuments(env, rows, { apiSource: "cron" })
            : null;
        })
      : null;

  const listing =
    budget.listing > 0
      ? await stage("raiz", () =>
          runVaultSafeListing({ maxRequests: budget.listing, apiSource: "cron" }),
        )
      : null;

  // Pastas dividem a cota com a listagem da raiz: recalcula depois dela.
  const folders = await stage("pastas", async () => {
    const safeLeft = Math.max(
      0,
      (await getD4SignQuotaStatus("documents/safe")).remaining - D4SIGN_HUMAN_RESERVE.safe,
    );
    const folderBudget = Math.min(budget.folders, safeLeft);
    return listing?.rateLimited !== true && folderBudget > 0
      ? runVaultFolderWalk({ maxRequests: folderBudget, apiSource: "cron" })
      : null;
  });

  // Remetente pelo log do PDF: lê os PDFs já guardados (sem cota) e baixa
  // os demais com a cota de download acima da reserva humana.
  const pdfLogs = await stage("remetente", () =>
    collectD4SignPdfLogs({ maxDownloads: budget.pdfLogs, deadline }),
  );

  return {
    ok: errors.length === 0 && listing?.ok !== false && phases?.ok !== false && folders?.ok !== false,
    errors,
    triggeredAt: new Date().toISOString(),
    trigger,
    webhook,
    budget,
    phases,
    enrich,
    listing,
    folders,
    pdfLogs,
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
