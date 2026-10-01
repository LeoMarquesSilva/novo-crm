/**
 * GET /api/crm/d4sign/documents/[uuid]/view
 *
 * Serve o PDF de um documento D4Sign com cache em Supabase Storage.
 *
 * Fluxo:
 *   1ª visualização  → POST /documents/{uuid}/download (1 req da cota desse método,
 *                      10/h, separada da listagem/signatários) → baixa a URL.
 *                      Se falhar e o contrato não estiver finalizado, tenta a URL de
 *                      generate-document-view (cota própria; é o original, sem assinaturas).
 *   Cache            → só para status "1" (finalizado); pendente sempre baixa de novo.
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
import {
  downloadD4SignDocumentPdf,
  fetchD4SignPdfFromUrl,
  type D4SignPdfDownloadResult,
} from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { recordD4SignPdfLog } from "@/lib/d4sign/pdf-log-sync";
import { isPdfBytes, readCachedPdf } from "@/lib/d4sign/pdf-bytes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

const BUCKET  = "d4sign-contracts";

/** POST /download (até 20s) + arquivo gerado na hora pela D4Sign (até 45s). */
export const maxDuration = 90;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const supabase = createSupabaseAdminClient();
  const filePath = `${uuid}.pdf`;

  // Só contrato finalizado (status "1") vai para o cache: o PDF de um
  // pendente muda a cada assinatura e o cache serviria a versão antiga.
  const { data: statusRow } = await supabase
    .from("d4sign_documents")
    .select("d4sign_status")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  const finalized = statusRow?.d4sign_status === "1";

  const bucket = supabase.storage.from(BUCKET);
  if (finalized) {
    const cached = await readCachedPdf(bucket, filePath);
    if (cached) return pdfResponse(cached, uuid);
  }

  const env = getD4SignEnv();
  if (!env.tokenApi) {
    return NextResponse.json({ error: "D4Sign não configurado." }, { status: 503 });
  }

  // 1ª via: POST /download. 2ª via (se a 1ª falhar ou estiver sem cota):
  // URL de visualização de generate-document-view. Cada uma tem cota própria.
  const failures: string[] = [];
  let downloaded: D4SignPdfDownloadResult | null = null;

  const downloadQuota = await getD4SignQuotaStatus("documents/download");
  if (downloadQuota.remaining >= 1) {
    downloaded = await downloadD4SignDocumentPdf({
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
    if (!downloaded.ok) failures.push(`Download: ${downloaded.error}`);
  } else {
    failures.push(`Download: limite de 10 PDFs por hora atingido${resetHint(downloadQuota.resetAt)}.`);
  }

  // generate-document-view devolve o arquivo original, sem assinaturas:
  // só serve de 2ª via para contrato que ainda não foi finalizado.
  if (!downloaded?.ok && !finalized) {
    const viewQuota = await getD4SignQuotaStatus("documents/generate-document-view");
    if (viewQuota.remaining >= 1) {
      try {
        const link = await D4SignConnector.fromEnv(env).generateDocumentView(uuid, {
          source: "view-fallback",
        });
        const fallback = await fetchD4SignPdfFromUrl(link, { apiStatus: 200 });
        if (fallback.ok) downloaded = fallback;
        else failures.push(`Visualização: ${fallback.error}`);
      } catch (error) {
        failures.push(`Visualização: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      failures.push(`Visualização: limite por hora atingido${resetHint(viewQuota.resetAt)}.`);
    }
  }

  if (!downloaded?.ok) {
    const limited = downloadQuota.remaining < 1 && failures.every((f) => /limite/i.test(f));
    const error = failures.join(" | ");
    console.error("[D4Sign] visualização de PDF falhou", { uuid, error });
    return NextResponse.json(
      { error, stage: downloaded && !downloaded.ok ? downloaded.stage : "api" },
      { status: limited ? 429 : downloaded && !downloaded.ok ? downloaded.status : 502 },
    );
  }
  if (!isPdfBytes(downloaded.bytes)) {
    return NextResponse.json({ error: "D4Sign não retornou um arquivo PDF.", stage: "content" }, { status: 422 });
  }

  // Duas cópias: a resposta pode destacar o buffer servido, e o `after`
  // gravaria 0 bytes se reutilizasse o mesmo ArrayBuffer.
  const pdfBytes = new Uint8Array(downloaded.bytes.slice(0));
  const cacheBytes = pdfBytes.slice();
  // PDF baixado de graça: aproveita para ler o remetente no log.
  const logBytes = pdfBytes.slice();
  after(() => recordD4SignPdfLog(uuid, logBytes));

  if (finalized) {
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
  }

  return pdfResponse(pdfBytes.buffer, uuid);
}

function resetHint(resetAt: string | null): string {
  if (!resetAt) return "";
  const time = new Date(resetAt).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return ` (libera às ${time})`;
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
