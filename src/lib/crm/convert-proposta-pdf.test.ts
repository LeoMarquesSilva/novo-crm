import { describe, expect, it, vi } from "vitest";
import { createProposalPdfConverter, resolveProposalPdfProvider, ProposalPdfError } from "./convert-proposta-pdf";

const docx = Buffer.from("PK-docx-fixture");
const pdf = Buffer.from("%PDF-1.7\nconverted fixture");

describe("conversão do Word canônico em PDF", () => {
  it("usa Word automático somente no desenvolvimento Windows e requer conversor na produção", () => {
    expect(resolveProposalPdfProvider({ NODE_ENV: "development" }, "win32")).toEqual({ kind: "word" });
    expect(() => resolveProposalPdfProvider({ NODE_ENV: "production" }, "win32")).toThrow(ProposalPdfError);
    expect(() => resolveProposalPdfProvider({ NODE_ENV: "development" }, "linux")).toThrow(ProposalPdfError);
    expect(resolveProposalPdfProvider({ NODE_ENV: "production", PROPOSAL_PDF_CONVERTER_URL: "https://converter.example" }, "linux")).toEqual({ kind: "gotenberg", url: "https://converter.example", token: undefined });
  });
  it("converte exatamente os bytes recebidos e reaproveita o PDF pelo hash", async () => {
    const convert = vi.fn(async () => pdf);
    const render = createProposalPdfConverter(convert);
    const [one, two] = await Promise.all([render(docx), render(Buffer.from(docx))]);
    expect(one).toEqual(pdf);
    expect(two).toEqual(pdf);
    expect(await render(docx)).toEqual(pdf);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledWith(docx);
  });
  it("não reutiliza PDF para dados diferentes e serializa as conversões", async () => {
    let active = 0;
    let peak = 0;
    const render = createProposalPdfConverter(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return pdf;
    });
    await Promise.all([render(docx), render(Buffer.from("PK-other"))]);
    expect(peak).toBe(1);
  });
  it("descarta pedido abortado antes de converter e permite tentativa posterior", async () => {
    const convert = vi.fn(async () => pdf);
    const render = createProposalPdfConverter(convert);
    const controller = new AbortController();
    controller.abort();
    await expect(render(docx, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(convert).not.toHaveBeenCalled();
    expect(await render(docx)).toEqual(pdf);
  });
  it("falha sem guardar resposta inválida e recupera na próxima tentativa", async () => {
    const convert = vi.fn().mockResolvedValueOnce(Buffer.from("HTML error")).mockResolvedValueOnce(pdf);
    const render = createProposalPdfConverter(convert);
    await expect(render(docx)).rejects.toThrow("PDF válido");
    expect(await render(docx)).toEqual(pdf);
    expect(convert).toHaveBeenCalledTimes(2);
  });
});
