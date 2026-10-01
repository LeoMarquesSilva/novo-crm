/**
 * GET /api/crm/d4sign/documents/[uuid]/view
 *
 * Serve o PDF de um documento D4Sign com cache em Supabase Storage.
 *
 * Fluxo:
 *   1ª visualização  → POST /documents/{uuid}/download (1 req da cota desse método,
 *                      10/h, separada da listagem/signatários) → baixa a URL
 *                      devolvida → só então salva no bucket e serve ao browser
 *   Próximas vezes   → serve direto do bucket (0 req quota D4Sign)
 *
 * Cache vazio ou que não começa com `%PDF` é apagado e baixado de novo.
 * Corpo inválido responde 422 e não é gravado.
 *
 * Bucket: `d4sign-contracts` (privado, acesso via service_role)
 */
import { after, NextResponse } from "next/server";
import { getD4SignQuotaStatus, logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { isPdfBytes, readCachedPdf } from "@/lib/d4sign/pdf-bytes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET  = "d4sign-contracts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const supabase = createSupabaseAdminClient();
  const filePath = `${uuid}.pdf`;

  const bucket = supabase.storage.from(BUCKET);
  const cached = await readCachedPdf(bucket, filePath);
  if (cached) return pdfResponse(cached, uuid);

  const env = getD4SignEnv();
  if (!env.tokenApi) {
    return NextResponse.json({ error: "D4Sign não configurado." }, { status: 503 });
  }

  const quota = await getD4SignQuotaStatus("documents/download");
  if (quota.remaining < 1) {
    const reset = quota.resetAt
      ? ` Libera às ${new Date(quota.resetAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}.`
      : "";
    return NextResponse.json(
      { error: `Limite de 10 downloads de PDF por hora da D4Sign atingido.${reset} Use "Abrir no D4Sign" enquanto isso.` },
      { status: 429 },
    );
  }

  const downloaded = await downloadD4SignDocumentPdf({
    uuid,
    apiBaseUrl: env.apiBaseUrl,
    tokenApi: env.tokenApi,
    cryptKey: env.cryptKey,
  });

  if (downloaded.apiStatus !== null) {
    const apiStatus = downloaded.apiStatus;
    after(() => {
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "POST",
        source: "view",
        httpStatus: apiStatus,
      });
    });
  }

  if (!downloaded.ok) {
    console.error("[D4Sign] visualização de PDF falhou", {
      uuid,
      stage: downloaded.stage,
      apiStatus: downloaded.apiStatus,
      error: downloaded.error,
    });
    return NextResponse.json(
      { error: downloaded.error, stage: downloaded.stage },
      { status: downloaded.status },
    );
  }
  if (!isPdfBytes(downloaded.bytes)) {
    return NextResponse.json({ error: "D4Sign não retornou um arquivo PDF.", stage: "content" }, { status: 422 });
  }

  // Duas cópias: a resposta pode destacar o buffer servido, e o `after`
  // gravaria 0 bytes se reutilizasse o mesmo ArrayBuffer.
  const pdfBytes = new Uint8Array(downloaded.bytes.slice(0));
  const cacheBytes = pdfBytes.slice();
  after(async () => {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, new Blob([cacheBytes], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      console.error("Falha ao armazenar PDF D4Sign em cache", uploadError);
    }
  });

  return pdfResponse(pdfBytes.buffer, uuid);
}

function pdfResponse(buf: ArrayBuffer, uuid: string): NextResponse {
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${uuid}.pdf"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
