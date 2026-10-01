/**
 * Download de PDF na D4Sign.
 *
 * Doc oficial: POST /documents/{uuid}/download
 * body {"type":"pdf","language":"pt"} → JSON {"url","name"}.
 * O arquivo só existe no GET dessa URL (temporária).
 *
 * O GET pode responder de três jeitos além do PDF direto, e todos são tratados:
 * - redirecionamento HTTP (seguido pelo fetch);
 * - página com cabeçalho `Refresh: 0;url=...` ou `<meta http-equiv="refresh">`
 *   (o mesmo truque que o portal usa para mandar ao login) — seguido uma vez;
 * - corpo em Base64 (`JVBERi…`), quando a conta devolve o arquivo codificado.
 *
 * Cada falha volta com `stage`, para o log dizer onde quebrou.
 *
 * @see https://docapi.d4sign.com.br/reference/download-de-um-documento
 */
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

import { isPdfBytes } from "./pdf-bytes";

const PDF_DOWNLOAD_BODY = { type: "pdf", language: "pt" } as const;

/** Hosts aceitos para a URL temporária: a D4Sign e o storage AWS que ela usa. */
const ALLOWED_FILE_HOSTS = ["d4sign.com.br", "amazonaws.com", "cloudfront.net"];

export type D4SignPdfDownloadStage = "api" | "url" | "file" | "content";

export type D4SignPdfDownloadResult =
  | { ok: true; bytes: ArrayBuffer; apiStatus: number }
  | {
      ok: false;
      status: number;
      error: string;
      apiStatus: number | null;
      stage: D4SignPdfDownloadStage;
    };

function isAllowedHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  return ALLOWED_FILE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

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
  return isAllowedHost(parsed.hostname) ? url : null;
}

/** Destino de `Refresh: 0;url=...` ou de `<meta http-equiv="refresh" content="0;url=...">`. */
export function readRefreshTarget(response: Response, body: string, base: string): string | null {
  const header = response.headers.get("refresh");
  const meta = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']([^"']+)["']/i.exec(body)?.[1];
  const raw = header ?? meta;
  const target = raw ? /url\s*=\s*['"]?([^'";]+)/i.exec(raw)?.[1]?.trim() : null;
  if (!target) return null;
  try {
    const url = new URL(target, base);
    return url.protocol === "https:" && isAllowedHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Corpo em Base64 de um PDF (`%PDF` codificado começa com `JVBER`). */
export function decodeBase64Pdf(bytes: Uint8Array): ArrayBuffer | null {
  const text = new TextDecoder()
    .decode(bytes)
    .replace(/^﻿/, "")
    .trim()
    .replace(/^data:application\/pdf;base64,/, "");
  if (!text.startsWith("JVBER")) return null;
  const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
  const out = new Uint8Array(decoded.byteLength);
  out.set(decoded);
  return isPdfBytes(out) ? out.buffer : null;
}

function clientStatus(apiStatus: number): number {
  return apiStatus >= 500 ? 502 : apiStatus;
}

function apiErrorMessage(apiStatus: number, payload: unknown): string {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const text = [record.mensagem_pt, record.message].find((v) => typeof v === "string") as
    | string
    | undefined;
  return text ? `D4Sign retornou ${apiStatus}: ${text}` : `D4Sign retornou ${apiStatus}.`;
}

function failure(
  stage: D4SignPdfDownloadStage,
  status: number,
  error: string,
  apiStatus: number | null,
): D4SignPdfDownloadResult {
  return { ok: false, stage, status, error, apiStatus };
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
    return failure("api", 502, "Falha ao conectar com a D4Sign.", null);
  }

  const apiStatus = apiResponse.status;
  let payload: unknown = null;
  try {
    payload = await apiResponse.json();
  } catch {
    payload = null;
  }

  if (!apiResponse.ok) {
    const message = apiErrorMessage(apiStatus, payload);
    // "Esta chave da API já atingiu o tempo limite para este método"
    const limited = apiStatus === 429 || /tempo limite|limite/i.test(message);
    return failure("api", limited ? 429 : clientStatus(apiStatus), message, apiStatus);
  }

  const fileUrl = readD4SignDownloadUrl(payload);
  if (!fileUrl) {
    const raw = payload && typeof payload === "object" ? (payload as { url?: unknown }).url : null;
    let host = "sem url";
    if (typeof raw === "string") {
      try {
        host = new URL(raw).host;
      } catch {
        host = "url inválida";
      }
    }
    return failure("url", 422, `A D4Sign não devolveu uma URL de download aceita (${host}).`, apiStatus);
  }

  let url = fileUrl;
  for (let hop = 0; hop < 2; hop++) {
    let fileResponse: Response;
    try {
      fileResponse = await fetchWithTimeout(url, { cache: "no-store", redirect: "follow" }, timeoutMs);
    } catch {
      return failure("file", 502, "Falha ao baixar o PDF da D4Sign.", apiStatus);
    }

    if (!fileResponse.ok) {
      await fileResponse.body?.cancel().catch(() => undefined);
      return failure(
        "file",
        502,
        `A URL de download da D4Sign respondeu ${fileResponse.status}.`,
        apiStatus,
      );
    }

    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (isPdfBytes(bytes)) return { ok: true, bytes: bytes.buffer, apiStatus };

    const decoded = decodeBase64Pdf(bytes);
    if (decoded) return { ok: true, bytes: decoded, apiStatus };

    const text = new TextDecoder().decode(bytes.slice(0, 4096));
    const next = readRefreshTarget(fileResponse, text, url);
    if (next && next !== url) {
      url = next;
      continue;
    }

    const contentType = fileResponse.headers.get("content-type") ?? "sem content-type";
    return failure(
      "content",
      422,
      `A D4Sign não retornou um PDF (${contentType}, ${bytes.byteLength} bytes).`,
      apiStatus,
    );
  }

  return failure("content", 422, "A D4Sign redirecionou o download mais de uma vez.", apiStatus);
}
