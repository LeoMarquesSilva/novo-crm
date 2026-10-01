/**
 * Pré-cache de PDFs no Supabase Storage (1 req `documents/download` por doc novo).
 * Pula documentos que já têm objeto não vazio no bucket e para no primeiro
 * erro da D4Sign (cota ou indisponibilidade).
 */
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "d4sign-contracts";

export async function precacheD4SignPdfs(
  uuids: string[],
  options?: { maxDownloads?: number },
): Promise<{ cached: number; skipped: number; error?: string }> {
  if (uuids.length === 0) return { cached: 0, skipped: 0 };

  const env = getD4SignEnv();
  if (!env.tokenApi) return { cached: 0, skipped: uuids.length };

  const maxDownloads = Math.max(0, options?.maxDownloads ?? 1);
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(BUCKET);
  let cached = 0;
  let skipped = 0;
  let downloads = 0;

  for (const uuid of uuids) {
    if (downloads >= maxDownloads) break;
    const filePath = `${uuid}.pdf`;
    const { data: existing } = await bucket.list("", { search: filePath, limit: 10 });
    const hit = existing?.find((file) => file.name === filePath);
    const size = Number((hit?.metadata as { size?: unknown } | null)?.size ?? 0);
    if (hit && size > 0) {
      skipped += 1;
      continue;
    }

    downloads += 1;
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
        source: "cron-precache",
        httpStatus: downloaded.apiStatus,
      });
    }

    if (!downloaded.ok) {
      console.error("[D4Sign] pré-cache falhou", { uuid, stage: downloaded.stage, error: downloaded.error });
      return { cached, skipped, error: downloaded.error };
    }

    const { error: uploadError } = await bucket.upload(filePath, downloaded.bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) {
      console.error("Falha ao armazenar PDF D4Sign em cache", uploadError);
      continue;
    }
    cached += 1;
  }

  return { cached, skipped };
}
