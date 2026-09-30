import { describe, expect, it, vi } from "vitest";

import { isPdfBytes, readCachedPdf } from "./pdf-bytes";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("isPdfBytes", () => {
  it("recusa corpo vazio", () => {
    expect(isPdfBytes(new Uint8Array())).toBe(false);
    expect(isPdfBytes(new ArrayBuffer(0))).toBe(false);
  });

  it("recusa conteúdo que não começa com %PDF", () => {
    expect(isPdfBytes(new TextEncoder().encode("not a pdf"))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode("<html></html>"))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode('{"url":"https://secure.d4sign.com.br/x"}'))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode(" %PDF-1.4"))).toBe(false);
    expect(isPdfBytes(new Uint8Array([0x25, 0x50, 0x44]))).toBe(false);
  });

  it("aceita buffer que começa com %PDF", () => {
    expect(isPdfBytes(PDF)).toBe(true);
    expect(isPdfBytes(PDF.buffer)).toBe(true);
  });
});

describe("readCachedPdf", () => {
  it("serve o cache quando o objeto é PDF", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const bytes = await readCachedPdf(
      {
        download: async () => ({ data: new Blob([PDF]), error: null }),
        remove,
      },
      "doc.pdf",
    );

    expect(bytes && isPdfBytes(bytes)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("apaga cache vazio e não devolve bytes", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const bytes = await readCachedPdf(
      {
        download: async () => ({ data: new Blob([]), error: null }),
        remove,
      },
      "empty.pdf",
    );

    expect(bytes).toBeNull();
    expect(remove).toHaveBeenCalledWith(["empty.pdf"]);
  });

  it("apaga objeto que não é PDF", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const bytes = await readCachedPdf(
      {
        download: async () => ({ data: new Blob([new TextEncoder().encode("hello")]), error: null }),
        remove,
      },
      "broken.pdf",
    );

    expect(bytes).toBeNull();
    expect(remove).toHaveBeenCalledWith(["broken.pdf"]);
  });

  it("não apaga quando o objeto não existe", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const bytes = await readCachedPdf(
      {
        download: async () => ({ data: null, error: { message: "not found" } }),
        remove,
      },
      "missing.pdf",
    );

    expect(bytes).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
