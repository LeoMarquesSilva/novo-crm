/**
 * Download de PDF na D4Sign.
 *
 * Doc oficial: POST /documents/{uuid}/download
 * body {"type":"pdf","language":"pt"} → JSON {"url","name"}.
 * O arquivo só existe no GET dessa URL (temporária).
 *
 * O GET pode responder de três jeitos além do PDF direto, e todos são tratados:
 * - redirecionamento HTTP, seguido à mão guardando cookies (sem cookie a
 *   D4Sign pode redirecionar para a mesma URL em loop);
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

/** URL https em host aceito para baixar arquivo da D4Sign. */
export function isAllowedFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isAllowedHost(url.hostname);
  } catch {
    return false;
  }
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

const MAX_FILE_HOPS = 6;

function followTarget(location: string, base: string): string | null {
  try {
    const url = new URL(location, base);
    return url.protocol === "https:" && isAllowedHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function storeCookies(jar: Map<string, string>, response: Response): void {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";", 1)[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

/** Motivo legível de um erro de fetch (timeout, DNS, TLS…), sem URL nem token. */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError" || error.name === "AbortError") return "tempo esgotado";
  const cause = (error as { cause?: { code?: unknown; message?: unknown } }).cause;
  const code = typeof cause?.code === "string" ? cause.code : null;
  const message = typeof cause?.message === "string" ? cause.message : error.message;
  return code ? `${code}: ${message}` : message;
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
  /** Prazo do POST /download. */
  timeoutMs?: number;
  /** Prazo total para baixar o arquivo (todas as etapas de redirecionamento). */
  fileTimeoutMs?: number;
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

  return fetchD4SignPdfFromUrl(fileUrl, { apiStatus, timeoutMs: input.fileTimeoutMs });
}

/**
 * Baixa o PDF de uma URL temporária da D4Sign (`/download` ou
 * `generate-document-view`), com redirecionamento manual, cookies,
 * `Refresh` e Base64. `apiStatus` é o status da chamada que gerou a URL.
 */
export async function fetchD4SignPdfFromUrl(
  startUrl: string,
  options: { apiStatus: number; timeoutMs?: number },
): Promise<D4SignPdfDownloadResult> {
  if (!isAllowedFileUrl(startUrl)) {
    let host = "url inválida";
    try {
      host = new URL(startUrl).host;
    } catch {
      // mantém "url inválida"
    }
    return failure("url", 422, `URL de arquivo da D4Sign fora dos hosts aceitos (${host}).`, options.apiStatus);
  }
  const fileTimeoutMs = options.timeoutMs ?? 45_000;
  const startedAt = Date.now();
  const cookies = new Map<string, string>();
  const apiStatus = options.apiStatus;
  let url = startUrl;
  for (let hop = 0; hop < MAX_FILE_HOPS; hop++) {
    const host = new URL(url).host;
    let fileResponse: Response;
    let bytes: Uint8Array;
    try {
      // Redirecionamento manual: a D4Sign pode mandar cookie de sessão e
      // redirecionar para a mesma URL; sem guardar o cookie, o fetch entra em loop.
      fileResponse = await fetchWithTimeout(
        url,
        {
          cache: "no-store",
          redirect: "manual",
          headers: {
            Accept: "application/pdf,*/*",
            ...(cookies.size > 0
              ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
              : {}),
          },
        },
        Math.max(1_000, fileTimeoutMs - (Date.now() - startedAt)),
      );
      storeCookies(cookies, fileResponse);

      const location = fileResponse.headers.get("location");
      if (fileResponse.status >= 300 && fileResponse.status < 400 && location) {
        await fileResponse.body?.cancel().catch(() => undefined);
        const next = followTarget(location, url);
        if (!next) {
          return failure("file", 502, `A D4Sign redirecionou o download para um destino recusado (${host}).`, apiStatus);
        }
        url = next;
        continue;
      }

      if (!fileResponse.ok) {
        await fileResponse.body?.cancel().catch(() => undefined);
        return failure(
          "file",
          502,
          `A URL de download da D4Sign respondeu ${fileResponse.status} (${host}).`,
          apiStatus,
        );
      }

      bytes = new Uint8Array(await fileResponse.arrayBuffer());
    } catch (error) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      return failure(
        "file",
        502,
        `Falha ao baixar o PDF da D4Sign (${host}, ${describeFetchError(error)}, ${seconds}s, etapa ${hop + 1}).`,
        apiStatus,
      );
    }

    if (isPdfBytes(bytes)) return { ok: true, bytes: bytes.buffer as ArrayBuffer, apiStatus };

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
      `A D4Sign não retornou um PDF (${host}, ${contentType}, ${bytes.byteLength} bytes).`,
      apiStatus,
    );
  }

  return failure("file", 502, `A D4Sign redirecionou o download mais de ${MAX_FILE_HOPS} vezes.`, apiStatus);
}
