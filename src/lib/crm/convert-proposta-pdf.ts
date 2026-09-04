import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
export class ProposalPdfError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); this.name = "ProposalPdfError"; }
}
type PdfProvider = { kind: "word" } | { kind: "gotenberg"; url: string; token: string | undefined };

export function resolveProposalPdfProvider(env: Record<string, string | undefined> = process.env, platform: string = process.platform): PdfProvider {
  const url = env.PROPOSAL_PDF_CONVERTER_URL?.trim();
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new ProposalPdfError("Endereço do conversor PDF inválido."); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new ProposalPdfError("Endereço do conversor PDF inválido.");
    }
    return { kind: "gotenberg", url: url.replace(/\/$/, ""), token: env.PROPOSAL_PDF_CONVERTER_TOKEN };
  }
  // Desktop automation is deliberately unavailable on production servers.
  if (env.NODE_ENV === "development" && platform === "win32") return { kind: "word" };
  throw new ProposalPdfError("A conversão da proposta para PDF ainda não está configurada neste servidor. Configure PROPOSAL_PDF_CONVERTER_URL para habilitar a prévia visual e o PDF.");
}

/** Bounded process-local cache, one conversion at a time, identical requests coalesced. */
export function createProposalPdfConverter(convert: (docx: Uint8Array) => Promise<Uint8Array>) {
  const cache = new Map<string, { bytes: Buffer; expires: number }>();
  const pending = new Map<string, Promise<Buffer>>();
  let queue: Promise<unknown> = Promise.resolve();
  return async (docx: Uint8Array, signal?: AbortSignal): Promise<Buffer> => {
    signal?.throwIfAborted();
    const key = createHash("sha256").update(docx).digest("hex");
    const now = Date.now();
    for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
    const cached = cache.get(key);
    if (cached) return cached.bytes;
    const existing = pending.get(key);
    if (existing) {
      const bytes = await existing;
      signal?.throwIfAborted();
      return bytes;
    }
    if (pending.size >= 8) throw new ProposalPdfError("Há outras prévias sendo geradas. Tente novamente em instantes.", 429);
    const work = queue.catch(() => undefined).then(async () => {
      signal?.throwIfAborted();
      const bytes = Buffer.from(await convert(docx));
      if (bytes.length > 32 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
        throw new ProposalPdfError("O conversor não retornou um PDF válido.", 502);
      }
      cache.set(key, { bytes, expires: Date.now() + 120_000 });
      while (cache.size > 4) cache.delete(cache.keys().next().value!);
      return bytes;
    });
    pending.set(key, work);
    queue = work.catch(() => undefined);
    try {
      const bytes = await work;
      signal?.throwIfAborted();
      return bytes;
    } finally { pending.delete(key); }
  };
}

async function convertWithWord(docx: Uint8Array): Promise<Uint8Array> {
  const folder = await mkdtemp(path.join(tmpdir(), "bp-proposal-"));
  const source = path.join(folder, "proposal.docx");
  const output = path.join(folder, "proposal.pdf");
  try {
    await writeFile(source, docx);
    await runFile("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-File", path.resolve("scripts/convert-proposta-word.ps1"),
      "-InputPath", source, "-OutputPath", output,
    ], { windowsHide: true, timeout: 60_000, maxBuffer: 128 * 1024 });
    return await readFile(output);
  } catch {
    throw new ProposalPdfError("Não foi possível converter a proposta com o Word local. Verifique se o Microsoft Word abre normalmente nesta máquina e tente novamente.");
  } finally {
    // folder is exclusively created by mkdtemp; never use a request-provided path.
    if (path.dirname(path.resolve(folder)) === path.resolve(tmpdir()) && path.basename(folder).startsWith("bp-proposal-")) {
      await rm(folder, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function convertWithService(docx: Uint8Array, provider: Extract<PdfProvider, { kind: "gotenberg" }>): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "proposal.docx");
  let response: Response;
  try {
    response = await fetch(`${provider.url}/forms/libreoffice/convert`, {
      method: "POST", body: form, signal: AbortSignal.timeout(45_000), redirect: "error",
      headers: provider.token ? { Authorization: `Bearer ${provider.token}` } : {},
    });
  } catch { throw new ProposalPdfError("O serviço de conversão PDF não respondeu. Tente novamente."); }
  if (!response.ok) throw new ProposalPdfError(`O serviço de conversão PDF retornou erro (HTTP ${response.status}).`, 502);
  if (response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") {
    throw new ProposalPdfError("O serviço de conversão não retornou um PDF válido.", 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProposalPdfError("O serviço de conversão retornou um PDF vazio.", 502);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 32 * 1024 * 1024) throw new ProposalPdfError("O PDF convertido excedeu o tamanho permitido.", 502);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks);
}

const localConverter = createProposalPdfConverter(convertWithWord);
const serviceConverters = new Map<string, ReturnType<typeof createProposalPdfConverter>>();

/** Takes generated DOCX bytes only; no business data or parallel document layout. */
export async function convertProposalDocxToPdf(docx: Uint8Array, signal?: AbortSignal): Promise<Buffer> {
  const provider = resolveProposalPdfProvider();
  if (provider.kind === "word") return localConverter(docx, signal);
  const key = createHash("sha256").update(provider.url + (provider.token ?? "")).digest("hex");
  let converter = serviceConverters.get(key);
  if (!converter) {
    converter = createProposalPdfConverter(bytes => convertWithService(bytes, provider));
    serviceConverters.clear();
    serviceConverters.set(key, converter);
  }
  return converter(docx, signal);
}
