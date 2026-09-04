import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { renderPropostaPdf } from "./render-proposta-pdf";

describe("renderPropostaPdf", () => {
  it("gera um PDF com o título de investimento e o texto das áreas", async () => {
    const bytes = await renderPropostaPdf({
      clienteIntro: "À ACME Ltda, pessoa jurídica de direito privado.",
      area: "Cível",
      escopo: "",
      escopoSections: [
        {
          areaLabel: "Cível",
          scopeTypeLabel: "1 processo",
          label: "Cível\n1 processo",
          text: "Prestação de serviços advocatícios no processo 000.",
        },
      ],
      resumo: "",
      investimento: "propõe-se o pagamento mensal de R$ 1.000,00, já incluídos os tributos incidentes.",
      dataVigencia: "08/09/2026",
    });
    expect(bytes.byteLength).toBeGreaterThan(800);
    expect(Buffer.from(bytes.subarray(0, 4)).toString("ascii")).toBe("%PDF");
    const pdf = await getDocumentProxy(Uint8Array.from(bytes));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join(" ") : extracted.text;
    expect(text).toMatch(/Investimento/i);
    expect(text).toContain("ACME");
  });
});
