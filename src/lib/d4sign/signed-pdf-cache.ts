import { getD4SignQuotaStatus, logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { isPdfBytes, readCachedPdf } from "@/lib/d4sign/pdf-bytes";
import { recordD4SignPdfLog } from "@/lib/d4sign/pdf-log-sync";
import { D4SIGN_HUMAN_RESERVE } from "@/lib/d4sign/sync-budget";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const D4SIGN_CONTRACTS_BUCKET = "d4sign-contracts";

export type SignedPdfResult =
  | { ok: true; bytes: Uint8Array; cached: boolean }
  | {
      ok: false;
      reason: "not_finalized" | "not_cached" | "quota_exhausted" | "download_failed" | "not_configured";
      message: string;
      resetAt?: string | null;
    };

/**
 * PDF assinado (status "1") do bucket `d4sign-contracts/{uuid}.pdf`; se não estiver lá
 * e `allowDownload`, baixa da D4Sign (1 req da cota `documents/download`, 10/h) e guarda.
 * Tarefas automáticas (`respectHumanReserve`) não usam as vagas reservadas para quem
 * abre o PDF na tela.
 */
export async function loadSignedContractPdf(
  uuid: string,
  options: { allowDownload: boolean; source: string; respectHumanReserve?: boolean },
): Promise<SignedPdfResult> {
  const supabase = createSupabaseAdminClient();
  const { data: statusRow } = await supabase
    .from("d4sign_documents")
    .select("d4sign_status")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  if (statusRow?.d4sign_status !== "1") {
    return { ok: false, reason: "not_finalized", message: "O contrato ainda não foi assinado por todos." };
  }

  const bucket = supabase.storage.from(D4SIGN_CONTRACTS_BUCKET);
  const filePath = `${uuid}.pdf`;
  const cached = await readCachedPdf(bucket, filePath);
  if (cached) return { ok: true, bytes: new Uint8Array(cached), cached: true };

  if (!options.allowDownload) {
    return { ok: false, reason: "not_cached", message: "O PDF assinado ainda não foi baixado da D4Sign." };
  }

  const env = getD4SignEnv();
  if (!env.tokenApi) return { ok: false, reason: "not_configured", message: "D4Sign não configurado." };

  const quota = await getD4SignQuotaStatus("documents/download");
  const reserve = options.respectHumanReserve ? D4SIGN_HUMAN_RESERVE.download : 0;
  if (quota.remaining <= reserve) {
    return {
      ok: false,
      reason: "quota_exhausted",
      message: "Limite de downloads de PDF da D4Sign atingido nesta hora.",
      resetAt: quota.resetAt,
    };
  }

  const downloaded = await downloadD4SignDocumentPdf({
    uuid,
    apiBaseUrl: env.apiBaseUrl,
    tokenApi: env.tokenApi,
    cryptKey: env.cryptKey,
  });
  if (downloaded.apiStatus !== null) {
    logD4SignApiCall({
      endpoint: "documents/download",
      method: "POST",
      source: options.source,
      httpStatus: downloaded.apiStatus,
    });
  }
  if (!downloaded.ok || !isPdfBytes(downloaded.bytes)) {
    return {
      ok: false,
      reason: "download_failed",
      message: downloaded.ok ? "A D4Sign não devolveu um PDF." : "Não foi possível baixar o PDF da D4Sign.",
    };
  }

  const bytes = new Uint8Array(downloaded.bytes.slice(0));
  const { error: uploadError } = await bucket.upload(filePath, new Blob([bytes.slice()], { type: "application/pdf" }), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) console.error("[D4Sign] PDF assinado não guardado em cache", uploadError.message);
  await recordD4SignPdfLog(uuid, bytes.slice()).catch(() => null);

  return { ok: true, bytes, cached: false };
}

/** Tempo estimado de um download de PDF da D4Sign (ver SYNC_ROUND_BUDGET_MS). */
const PDF_DOWNLOAD_ESTIMATE_MS = 40_000;

/**
 * Etapa do sync: guarda no bucket o PDF assinado de contratos de leads que ainda não
 * estão lá (a inclusão no faturamento lê o PDF para a IA). Do mais recente ao mais antigo.
 */
export async function cacheSignedOpportunityPdfs(options: {
  maxDownloads: number;
  deadline?: number;
}): Promise<{ checked: number; downloaded: number }> {
  const result = { checked: 0, downloaded: 0 };
  if (options.maxDownloads < 1) return result;

  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc")
    .eq("d4sign_status", "1")
    .not("oportunidade_id", "is", null)
    .order("finalized_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error || !rows) return result;

  const bucket = supabase.storage.from(D4SIGN_CONTRACTS_BUCKET);
  for (const row of rows as { uuid_doc: string }[]) {
    if (result.downloaded >= options.maxDownloads) break;
    if (options.deadline && Date.now() + PDF_DOWNLOAD_ESTIMATE_MS > options.deadline) break;
    result.checked += 1;
    const { data: found } = await bucket.list("", { search: `${row.uuid_doc}.pdf`, limit: 1 });
    if (found && found.length > 0) continue;
    const loaded = await loadSignedContractPdf(row.uuid_doc, {
      allowDownload: true,
      source: "cron-signed-pdf",
      respectHumanReserve: true,
    });
    if (loaded.ok && !loaded.cached) result.downloaded += 1;
    if (!loaded.ok && loaded.reason === "quota_exhausted") break;
  }
  return result;
}
