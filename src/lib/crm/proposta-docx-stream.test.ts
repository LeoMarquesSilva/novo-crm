import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { proposalDocxStream } from "./proposta-docx-stream";

describe("download Word em streaming", () => {
  it("entrega um documento acima de 4,5 MB integralmente e sem alterar seus bytes", async () => {
    const bytes = Uint8Array.from({ length: 9_000_013 }, (_, index) => index % 251);
    const response = new Response(proposalDocxStream(bytes));
    expect(response.headers.has("Content-Length")).toBe(false);
    const downloaded = new Uint8Array(await response.arrayBuffer());
    const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    expect(downloaded.byteLength).toBe(bytes.byteLength);
    expect(hash(downloaded)).toBe(hash(bytes));
  });

  it("permite cancelar o download entre blocos", async () => {
    const reader = proposalDocxStream(new Uint8Array(200_000)).getReader();
    expect((await reader.read()).value?.length).toBe(64 * 1024);
    await reader.cancel();
    expect((await reader.read()).done).toBe(true);
  });
});
