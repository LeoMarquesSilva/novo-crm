import { describe, expect, it } from "vitest";
import { clipContractTextForExtraction } from "./clip-for-extraction";
import { parseContractImportExtraction } from "./schemas";

describe("clipContractTextForExtraction", () => {
  it("mantém o preâmbulo, janelas de honorários e CNPJs sem o certificado", () => {
    const filler = "Lorem ipsum dolor sit amet. ".repeat(400);
    const body = [
      "CONTRATO DE HONORÁRIOS — GRUPO PAGUE MENOS",
      "Contratante: EMPREENDIMENTOS PAGUE MENOS S/A, CNPJ 06.626.253/0001-51.",
      filler,
      "CLÁUSULA 4. Honorários de R$ 85,00 por pasta ativa, quantidade total.",
      "Franquia de 25 horas mensais; excedente de hora a R$ 650,00.",
      "Prazo indeterminado, reajuste IPCA, vencimento no dia 10.",
      filler,
      "Certificado de assinaturas gerado em 22 de August de 2026",
    ].join("\n");

    const clipped = clipContractTextForExtraction({
      filename: "pague-menos.pdf",
      text: body,
    });

    expect(clipped.originalChars).toBeGreaterThan(clipped.clippedChars);
    expect(clipped.clippedChars).toBeLessThanOrEqual(16_000);
    expect(clipped.text).toContain("pague-menos.pdf");
    expect(clipped.text).toContain("06626253000151");
    expect(clipped.text).toContain("R$ 85,00 por pasta");
    expect(clipped.text).toContain("25 horas");
    expect(clipped.text).not.toContain("Certificado de assinaturas");
  });

  it("limita o recorte ao teto mesmo com muitas janelas", () => {
    const honorarios = "Honorários mensais de R$ 1.000,00. ".repeat(2_000);
    const clipped = clipContractTextForExtraction({
      filename: "grande.pdf",
      text: honorarios,
      cap: 4_000,
    });
    expect(clipped.clippedChars).toBeLessThanOrEqual(4_000);
  });

  it("recorta o gold Le Blog em torno de êxito e IGP-M sem o certificado", () => {
    const filler = "Texto institucional sem cláusula financeira. ".repeat(250);
    const body = [
      "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS — GRUPO LE BLOG",
      "Contratante: LE BLOG STORE LTDA, CNPJ 28.123.456/0001-90.",
      filler,
      "CLÁUSULA 4. Honorários mensais líquidos de R$ 15.000,00 e êxito de 3% sobre o passivo.",
      "CLÁUSULA 7. Reajuste anual pelo IGP-M. Prazo indeterminado.",
      filler,
      "Certificado de assinaturas gerado em 06 de August de 2026",
    ].join("\n");

    const clipped = clipContractTextForExtraction({
      filename: "le-blog.pdf",
      text: body,
    });

    expect(clipped.originalChars).toBeGreaterThan(clipped.clippedChars);
    expect(clipped.text).toContain("le-blog.pdf");
    expect(clipped.text).toContain("GRUPO LE BLOG");
    expect(clipped.text).toContain("êxito de 3%");
    expect(clipped.text).toContain("IGP-M");
    expect(clipped.text).not.toContain("Certificado de assinaturas");
  });
});

describe("parseContractImportExtraction evidence", () => {
  it("aceita citações curtas e corta objectText longo", () => {
    const parsed = parseContractImportExtraction({
      groupName: "Grupo Le Blog",
      parties: [],
      startsAt: "2026-08-06",
      signedAt: "2026-08-06",
      indefinite: true,
      dueDay: 6,
      firstInvoiceAt: "2026-08-06",
      firstInvoiceConditioned: true,
      adjustmentIndex: "IGP-M",
      taxMode: "added",
      areas: [],
      components: [],
      d4signUuid: null,
      signers: [],
      extras: {
        objectText: "A".repeat(400),
        solidarity: true,
        exitoBands: null,
        lgpd: false,
        confidentiality: false,
        moraFinePercent: 10,
        kmRateCents: 200,
      },
      evidence: [
        { field: "adjustmentIndex", quote: "reajuste anual pelo IGP-M", clause: "cláusula 7" },
      ],
    });
    expect(parsed.evidence).toHaveLength(1);
    expect(parsed.extras.objectText?.endsWith("…")).toBe(true);
    expect((parsed.extras.objectText ?? "").length).toBeLessThanOrEqual(240);
  });

  it("corta citação longa e descarta excedentes em vez de reprovar", () => {
    const parsed = parseContractImportExtraction({
      extras: {
        objectText: null,
        solidarity: false,
        exitoBands: null,
        lgpd: false,
        confidentiality: false,
        moraFinePercent: null,
        kmRateCents: null,
      },
      evidence: [
        { field: "components", quote: "B".repeat(400), clause: "C".repeat(120) },
        { field: "startsAt", quote: "   ", clause: null },
        ...Array.from({ length: 20 }, (_, i) => ({ field: "areas", quote: `trecho ${i}`, clause: null })),
      ],
    });
    expect(parsed.evidence).toHaveLength(16);
    expect(parsed.evidence[0].quote.length).toBeLessThanOrEqual(160);
    expect(parsed.evidence[0].quote.endsWith("…")).toBe(true);
    expect((parsed.evidence[0].clause ?? "").length).toBeLessThanOrEqual(80);
    expect(parsed.evidence.some((item) => item.field === "startsAt")).toBe(false);
  });
});
