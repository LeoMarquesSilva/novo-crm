import { beforeAll, describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import type { CanonicalProposalData } from "./proposta-docx-data";
import { buildPropostaPdf, PROPOSTA_MODELO_PAGE, readPropostaPdfAssets } from "./proposta-pdf-builder";

const LONG_PARAGRAPH =
  "A atuação compreenderá a análise da documentação societária, contratual e fiscal, a elaboração de pareceres, " +
  "a condução de negociações com credores e a representação judicial e extrajudicial em todas as instâncias, " +
  "com acompanhamento de prazos, audiências, sustentações orais e reuniões periódicas de alinhamento estratégico.";

function canonical(overrides: Partial<CanonicalProposalData> = {}): CanonicalProposalData {
  return {
    generatedAt: "2026-11-03T15:00:00.000Z",
    templateData: {
      EMPRESA: "Indústria Açucareira São João Ltda.",
      RESPONSAVEL: "Conceição Araújo",
      DATA_PROPOSTA: "3 de novembro de 2026",
      DATA_VIGENCIA: "10/11/2026",
      INVESTIMENTO: "Investimento\n\nPagamento mensal de R$ 12.700,00 (doze mil e setecentos reais).",
    },
    escopoSections: [
      { areaLabel: "Cível", scopeTypeLabel: "1 processo", label: "Cível\n1 processo", text: "Defesa nos autos da ação de cobrança." },
    ],
    ...overrides,
  };
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
  return text.map(page => page.replace(/\s+/g, " "));
}

/** Image sizes drawn by a page: identifies which model page was copied. */
function imageFingerprint(doc: PDFDocument, index: number): string[] {
  const resources = doc.getPage(index).node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return (xObjects?.entries() ?? [])
    .map(([, ref]) => doc.context.lookup(ref))
    .filter((obj): obj is PDFRawStream => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))
    .map(obj => `${obj.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber()}x${obj.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber()}`)
    .sort();
}

describe("buildPropostaPdf", () => {
  let model: PDFDocument;
  beforeAll(async () => {
    model = await PDFDocument.load(readPropostaPdfAssets().modelo);
  });

  it("monta capa, institucional, conteúdo, CVs, assinaturas e contracapa nessa ordem", async () => {
    const bytes = await buildPropostaPdf(canonical());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(7);
    const P = PROPOSTA_MODELO_PAGE;
    [P.capa, P.institucional, null, P.cvGustavo, P.cvRicardo, P.assinaturas, P.contracapa].forEach((modelIndex, index) => {
      if (modelIndex !== null) expect(imageFingerprint(doc, index)).toEqual(imageFingerprint(model, modelIndex));
    });

    const texts = await pageTexts(bytes);
    expect(texts[1]).toContain("QUEM SOMOS");
    expect(texts[2]).toContain("Cível");
    expect(texts[2]).toContain("1 processo: Defesa nos autos da ação de cobrança.");
    expect(texts[2]).toContain("Investimento");
    expect(texts[2]).toContain("R$ 12.700,00");
  });

  it("escreve cliente em caixa alta, remetente e data na capa com acentos", async () => {
    const [capa] = await pageTexts(await buildPropostaPdf(canonical()));
    expect(capa).toContain("INDÚSTRIA AÇUCAREIRA SÃO JOÃO LTDA.");
    expect(capa).toContain("Enviado por: Conceição Araújo");
    expect(capa).toContain("Campinas/SP, 3 de novembro de 2026");
  });

  it("coloca a vigência só na folha de assinaturas, sem datas de exemplo do modelo", async () => {
    const texts = await pageTexts(await buildPropostaPdf(canonical()));
    const assinaturas = texts[texts.length - 2];
    expect(assinaturas).toContain("Gustavo Bismarchi Motta");
    expect(assinaturas).toContain("Vigência da Proposta: 10/11/2026");
    expect(texts.filter(text => text.includes("10/11/2026"))).toHaveLength(1);
    expect(texts.join(" ")).not.toContain("06/10/2026");
  });

  it("quebra escopo longo em várias páginas do timbrado mantendo o fim do conteúdo", async () => {
    const text = Array.from({ length: 14 }, (_, i) => `Etapa ${i + 1}. ${LONG_PARAGRAPH}`).join("\n\n");
    const bytes = await buildPropostaPdf(canonical({
      escopoSections: [
        { areaLabel: "Reestruturação", scopeTypeLabel: "Recuperação judicial", label: "", text },
        { areaLabel: "Tributário", scopeTypeLabel: null, label: "", text: "Consultoria tributária contínua." },
      ],
    }));
    const texts = await pageTexts(bytes);
    expect(texts.length).toBeGreaterThanOrEqual(8);
    const content = texts.slice(2, -4);
    expect(content.length).toBeGreaterThanOrEqual(2);
    expect(content[0]).toContain("Recuperação judicial: Etapa 1.");
    expect(content[0]).not.toContain("Etapa 14.");
    expect(content.slice(1).join(" ")).toContain("Etapa 14.");
    expect(content[content.length - 1]).toContain("Investimento");
  });
});
