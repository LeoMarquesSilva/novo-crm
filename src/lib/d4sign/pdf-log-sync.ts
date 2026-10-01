/**
 * Remetente dos documentos D4Sign pelo log do PDF (`pdf-log.ts`).
 *
 * Fila: `log_parsed_at` nulo, do mais recente ao mais antigo. PDF já no bucket
 * `d4sign-contracts` é lido sem cota; os demais custam 1 `documents/download`
 * cada (e, se finalizados, ficam no bucket — substitui o antigo pré-cache).
 */
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { isPdfBytes } from "@/lib/d4sign/pdf-bytes";
import { readD4SignPdfLog, type D4SignLogActor } from "@/lib/d4sign/pdf-log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "d4sign-contracts";

/** Lê o log e grava remetente/data de envio. Nunca lança. */
export async function recordD4SignPdfLog(
  uuid: string,
  bytes: ArrayBuffer | Uint8Array,
): Promise<D4SignLogActor | null> {
  const supabase = createSupabaseAdminClient();
  let sender: D4SignLogActor | null = null;
  try {
    const log = await readD4SignPdfLog(bytes);
    sender = log.sentBy ?? log.createdBy;
  } catch (error) {
    console.warn("[D4Sign] log do PDF ilegível", uuid, error instanceof Error ? error.message : error);
  }
  const { error } = await supabase
    .from("d4sign_documents")
    .update({
      log_parsed_at: new Date().toISOString(),
      ...(sender
        ? { sent_by_name: sender.name, sent_by_email: sender.email, sent_at: sender.at }
        : {}),
    })
    .eq("uuid_doc", uuid);
  if (error) console.warn("[D4Sign] remetente não gravado", uuid, error.message);
  return sender;
}

export async function collectD4SignPdfLogs(options: {
  maxDownloads: number;
  maxFromCache?: number;
}): Promise<{ fromCache: number; downloaded: number; senders: number; error?: string }> {
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(BUCKET);
  const result = { fromCache: 0, downloaded: 0, senders: 0 } as {
    fromCache: number;
    downloaded: number;
    senders: number;
    error?: string;
  };

  const { data: queue, error } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, d4sign_status")
    .is("log_parsed_at", null)
    .order("created_at_d4sign", { ascending: false, nullsFirst: false })
    .order("name_document", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw error;
  if (!queue?.length) return result;

  const { data: files } = await bucket.list("", { limit: 1000 });
  const cachedNames = new Set(
    (files ?? [])
      .filter((f) => Number((f.metadata as { size?: unknown } | null)?.size ?? 0) > 0)
      .map((f) => f.name),
  );

  const maxFromCache = options.maxFromCache ?? 25;
  const env = getD4SignEnv();
  let downloadsStopped = !env.tokenApi;
  for (const doc of queue) {
    const path = `${doc.uuid_doc}.pdf`;
    if (cachedNames.has(path)) {
      if (result.fromCache >= maxFromCache) continue;
      const { data } = await bucket.download(path);
      if (!data) continue;
      result.fromCache += 1;
      if (await recordD4SignPdfLog(doc.uuid_doc, await data.arrayBuffer())) result.senders += 1;
      continue;
    }

    if (downloadsStopped || result.downloaded >= options.maxDownloads) continue;
    result.downloaded += 1;
    const downloaded = await downloadD4SignDocumentPdf({
      uuid: doc.uuid_doc,
      apiBaseUrl: env.apiBaseUrl,
      tokenApi: env.tokenApi,
      cryptKey: env.cryptKey,
    });
    if (downloaded.apiStatus !== null) {
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "POST",
        source: "cron-log",
        httpStatus: downloaded.apiStatus,
      });
    }
    if (!downloaded.ok || !isPdfBytes(downloaded.bytes)) {
      result.error = downloaded.ok ? "D4Sign não retornou PDF." : downloaded.error;
      // Cota ou indisponibilidade: para as baixas desta rodada; cache segue.
      downloadsStopped = true;
      continue;
    }
    if (await recordD4SignPdfLog(doc.uuid_doc, downloaded.bytes)) result.senders += 1;
    // Só finalizado vai para o bucket: o PDF de pendente muda a cada assinatura.
    if (doc.d4sign_status === "1") {
      const { error: uploadError } = await bucket.upload(path, downloaded.bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) console.error("Falha ao armazenar PDF D4Sign em cache", uploadError);
    }
  }
  return result;
}
