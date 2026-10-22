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
 * (`cursor/sync-round`, `http_status` nulo, fora da cota); com uma rodada
 * marcada há menos de `SYNC_ROUND_MIN_INTERVAL_MS`, a nova não roda (`claimRound`).
 */
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { runPendingSignatureBackfill } from "@/lib/d4sign/pending-backfill";
import { collectD4SignPdfLogs } from "@/lib/d4sign/pdf-log-sync";
import { cacheSignedOpportunityPdfs } from "@/lib/d4sign/signed-pdf-cache";
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

/**
 * Grava a marca da rodada e confere se ela é a primeira do intervalo. Ler a última
 * marca e depois gravar não é atômico: páginas abertas juntas viam a rodada velha e
 * rodavam todas (46 de 228 numa semana começaram a menos de 5s da anterior). Cada
 * uma grava a sua; só segue a de menor `id` no intervalo, e as outras apagam a própria.
 */
async function claimRound(trigger: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data: mine, error } = await supabase
    .from("d4sign_api_usage")
    .insert({
      endpoint: SYNC_ROUND_ENDPOINT,
      method: "GET",
      source: trigger,
      http_status: null,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;

  const since = new Date(new Date(mine.created_at).getTime() - SYNC_ROUND_MIN_INTERVAL_MS);
  const { data: first, error: firstError } = await supabase
    .from("d4sign_api_usage")
    .select("id")
    .eq("endpoint", SYNC_ROUND_ENDPOINT)
    .gt("created_at", since.toISOString())
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstError) throw firstError;
  if (first?.id === mine.id) return true;

  await supabase.from("d4sign_api_usage").delete().eq("id", mine.id);
  return false;
}

export async function runD4SignSyncRound(trigger: string) {
  const deadline = Date.now() + SYNC_ROUND_BUDGET_MS;
  if (!(await claimRound(trigger))) {
    return {
      ok: true,
      skipped: true,
      rateLimited: false,
      reason: "Outra rodada do sync D4Sign começou há menos de 4 minutos.",
      triggeredAt: new Date().toISOString(),
      trigger,
    };
  }
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

  // PDF assinado dos leads (a inclusão no faturamento lê o PDF): 1 download por rodada.
  const signedPdfBudget = Math.min(1, budget.pdfLogs);
  const signedPdfs = await stage("pdf-assinado", () =>
    cacheSignedOpportunityPdfs({ maxDownloads: signedPdfBudget, deadline }),
  );

  // Remetente pelo log do PDF: lê os PDFs já guardados (sem cota) e baixa
  // os demais com a cota de download acima da reserva humana.
  const pdfLogs = await stage("remetente", () =>
    collectD4SignPdfLogs({ maxDownloads: Math.max(0, budget.pdfLogs - (signedPdfs?.downloaded ?? 0)), deadline }),
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
    signedPdfs,
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
