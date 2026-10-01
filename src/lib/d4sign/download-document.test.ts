import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeBase64Pdf,
  downloadD4SignDocumentPdf,
  readD4SignDownloadUrl,
} from "./download-document";

const UUID = "c686dbc1-1111-4111-8111-111111111111";
const FILE_URL = "https://secure.d4sign.com.br/download/CODE";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readD4SignDownloadUrl", () => {
  it("aceita https no host da D4Sign e no storage AWS", () => {
    expect(readD4SignDownloadUrl({ url: FILE_URL, name: "test.pdf" })).toBe(FILE_URL);
    const s3 = "https://d4sign-docs.s3.sa-east-1.amazonaws.com/x.pdf?X-Amz-Signature=abc";
    expect(readD4SignDownloadUrl({ url: s3 })).toBe(s3);
  });

  it("recusa URL fora da D4Sign, http e corpo sem url", () => {
    expect(readD4SignDownloadUrl({ url: "https://evil.example/file.pdf" })).toBeNull();
    expect(readD4SignDownloadUrl({ url: "http://secure.d4sign.com.br/file.pdf" })).toBeNull();
    expect(readD4SignDownloadUrl({ name: "test.pdf" })).toBeNull();
    expect(readD4SignDownloadUrl(null)).toBeNull();
  });
});

describe("downloadD4SignDocumentPdf", () => {
  const input = {
    uuid: UUID,
    apiBaseUrl: "https://secure.d4sign.com.br/api/v1",
    tokenApi: "test-token",
    cryptKey: "test-crypt",
  };

  it("faz POST com type pdf e só devolve o arquivo da url", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "contrato.pdf" }))
      .mockResolvedValueOnce(new Response(PDF, { status: 200, headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Uint8Array(result.bytes).slice(0, 4)).toEqual(PDF.slice(0, 4));
    expect(result.apiStatus).toBe(200);

    const [endpoint, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(endpoint)).toContain(`/documents/${UUID}/download?`);
    expect(String(endpoint)).toContain("tokenAPI=test-token");
    expect(String(endpoint)).toContain("cryptKey=test-crypt");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ type: "pdf", language: "pt" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("secure.d4sign.com.br/download/CODE");
  });

  it("responde 422 e não baixa arquivo quando o corpo está vazio ou não é PDF", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "vazio.pdf" }))
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const empty = await downloadD4SignDocumentPdf(input);
    expect(empty).toMatchObject({ ok: false, status: 422, apiStatus: 200 });

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "pagina.html" }))
      .mockResolvedValueOnce(new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }));

    const html = await downloadD4SignDocumentPdf(input);
    expect(html).toMatchObject({ ok: false, status: 422, apiStatus: 200 });
  });

  it("propaga 429 sem buscar a url do arquivo", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ message: "limit" }, 429));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result).toMatchObject({ ok: false, status: 429, apiStatus: 429, stage: "api" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("trata a mensagem de limite por método como 429 e repassa o texto", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ message: "Esta chave da API já atingiu o tempo limite para este método" }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result).toMatchObject({ ok: false, status: 429, apiStatus: 401 });
    if (result.ok) return;
    expect(result.error).toContain("tempo limite");
  });

  it("segue o cabeçalho Refresh até o PDF", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "contrato.pdf" }))
      .mockResolvedValueOnce(
        new Response("\uFEFF", {
          status: 200,
          headers: { "Content-Type": "text/html", Refresh: "0;url=https://secure.d4sign.com.br/arquivo/real.pdf" },
        }),
      )
      .mockResolvedValueOnce(new Response(PDF, { status: 200, headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("https://secure.d4sign.com.br/arquivo/real.pdf");
  });

  it("segue redirecionamento guardando o cookie de sessão", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "contrato.pdf" }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: FILE_URL, "Set-Cookie": "ci_session=abc; path=/; secure" },
        }),
      )
      .mockResolvedValueOnce(new Response(PDF, { status: 200, headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result.ok).toBe(true);
    const headers = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(headers.Cookie).toBe("ci_session=abc");
    expect(fetchMock.mock.calls[1]?.[1]?.redirect).toBe("manual");
  });

  it("diz o host e o motivo quando a busca do arquivo lança erro", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "contrato.pdf" }))
      .mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), {
          cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", message: "unable to verify the first certificate" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result).toMatchObject({ ok: false, status: 502, stage: "file", apiStatus: 200 });
    if (result.ok) return;
    expect(result.error).toContain("secure.d4sign.com.br");
    expect(result.error).toContain("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
  });

  it("decodifica PDF entregue em Base64", async () => {
    const base64 = Buffer.from(PDF).toString("base64");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: FILE_URL, name: "contrato.pdf" }))
      .mockResolvedValueOnce(new Response(base64, { status: 200, headers: { "Content-Type": "text/plain" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result.ok).toBe(true);
    expect(decodeBase64Pdf(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("não segue url que não é da D4Sign", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ url: "https://evil.example/file.pdf", name: "x.pdf" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadD4SignDocumentPdf(input);

    expect(result).toMatchObject({ ok: false, status: 422, apiStatus: 200, stage: "url" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
