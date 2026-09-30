/**
 * Pré-cache de PDFs no Supabase Storage (1 req D4Sign por doc novo).
 * Objeto já cacheado só conta se tiver bytes e começar com `%PDF`.
 * Corpo vazio ou inválido não é gravado.
 */
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { isPdfBytes, readCachedPdf } from "@/lib/d4sign/pdf-bytes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "d4sign-contracts";

export async function precacheD4SignPdfs(uuids: string[]): Promise<{ cached: number; skipped: number }> {
  if (uuids.length === 0) return { cached: 0, skipped: 0 };

  const env = getD4SignEnv();
  if (!env.tokenApi) return { cached: 0, skipped: uuids.length };

  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(BUCKET);
  let cached = 0;
  let skipped = 0;

  for (const uuid of uuids) {
    const filePath = `${uuid}.pdf`;
    const { data: existing } = await bucket.list("", {
      search: filePath,
      limit: 10,
    });
    if (existing?.some((file) => file.name === filePath)) {
      const cachedBytes = await readCachedPdf(bucket, filePath);
      if (cachedBytes) {
        skipped += 1;
        continue;
      }
    }

    let downloaded: Awaited<ReturnType<typeof downloadD4SignDocumentPdf>>;
    try {
      downloaded = await downloadD4SignDocumentPdf({
        uuid,
        apiBaseUrl: env.apiBaseUrl,
        tokenApi: env.tokenApi,
        cryptKey: env.cryptKey,
      });
    } catch {
      break;
    }

    if (downloaded.apiStatus !== null) {
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "POST",
        source: "cron-precache",
        httpStatus: downloaded.apiStatus,
      });
    }

    if (!downloaded.ok) {
      if (downloaded.apiStatus !== 200) break;
      continue;
    }
    if (!isPdfBytes(downloaded.bytes)) continue;

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
