/**
 * Download de PDF na D4Sign.
 *
 * Doc oficial: POST /documents/{uuid}/download
 * body {"type":"pdf","language":"pt"} → JSON {"url","name"}.
 * O arquivo só existe no GET dessa URL.
 *
 * @see https://docapi.d4sign.com.br/reference/download-de-um-documento
 */
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

import { isPdfBytes } from "./pdf-bytes";

const PDF_DOWNLOAD_BODY = { type: "pdf", language: "pt" } as const;

export type D4SignPdfDownloadResult =
  | { ok: true; bytes: ArrayBuffer; apiStatus: number }
  | { ok: false; status: number; error: string; apiStatus: number | null };

export function readD4SignDownloadUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const url = (body as { url?: unknown }).url;
  if (typeof url !== "string" || url.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/\.$/, "").toLowerCase();
  const allowed = host === "d4sign.com.br" || host.endsWith(".d4sign.com.br");
  return allowed ? url : null;
}

function clientStatus(apiStatus: number): number {
  return apiStatus >= 500 ? 502 : apiStatus;
}

export async function downloadD4SignDocumentPdf(input: {
  uuid: string;
  apiBaseUrl: string;
  tokenApi: string;
  cryptKey?: string;
  timeoutMs?: number;
}): Promise<D4SignPdfDownloadResult> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  const query = new URLSearchParams({ tokenAPI: input.tokenApi });
  if (input.cryptKey) query.set("cryptKey", input.cryptKey);

  const endpoint = `${input.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(input.uuid)}/download?${query.toString()}`;

  let apiResponse: Response;
  try {
    apiResponse = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(PDF_DOWNLOAD_BODY),
        cache: "no-store",
      },
      timeoutMs,
    );
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Falha ao conectar com a D4Sign.",
      apiStatus: null,
    };
  }

  const apiStatus = apiResponse.status;
  if (!apiResponse.ok) {
    await apiResponse.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      status: clientStatus(apiStatus),
      error: `D4Sign retornou ${apiStatus}.`,
      apiStatus,
    };
  }

  let payload: unknown;
  try {
    payload = await apiResponse.json();
  } catch {
    return {
      ok: false,
      status: 422,
      error: "D4Sign não retornou um arquivo PDF.",
      apiStatus,
    };
  }

  const fileUrl = readD4SignDownloadUrl(payload);
  if (!fileUrl) {
    return {
      ok: false,
      status: 422,
      error: "D4Sign não retornou um arquivo PDF.",
      apiStatus,
    };
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetchWithTimeout(fileUrl, { cache: "no-store" }, timeoutMs);
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Falha ao baixar o PDF da D4Sign.",
      apiStatus,
    };
  }

  if (!fileResponse.ok) {
    await fileResponse.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      status: 502,
      error: "Falha ao baixar o PDF da D4Sign.",
      apiStatus,
    };
  }

  const bytes = await fileResponse.arrayBuffer();
  if (!isPdfBytes(bytes)) {
    return {
      ok: false,
      status: 422,
      error: "D4Sign não retornou um arquivo PDF.",
      apiStatus,
    };
  }

  return { ok: true, bytes, apiStatus };
}
