import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { generateContratoDocxBuffer } from "./generate-contrato-docx";
import type { ContratoDocumentPagePreview } from "./contrato-docx-data";

function basePage(overrides: Partial<ContratoDocumentPagePreview> = {}): ContratoDocumentPagePreview {
  return {
    qualificacoesPartes: ["Empresa Única LTDA, inscrita no CNPJ nº 11.111.111/0001-11."],
    objeto: "Objeto de teste.",
    valores: "R$ 1.000,00 mensais.",
    investimento: "",
    dataAssinatura: "01/01/2026",
    limiteProcessos: "",
    limiteHoras: "",
    exitoAreas: "",
    tipoPagamento: "",
    prazoConfeccao: "",
    prazoRevisao: "",
    areas: [],
    objetosExcluidos: null,
    clausulasAdicionais: [],
    ...overrides,
  };
}

async function extractDocumentXml(buffer: Buffer): Promise<string> {
  const zip = new PizZip(buffer);
  return zip.file("word/document.xml")?.asText() ?? "";
}

describe("generateContratoDocxBuffer — qualificação de CONTRATANTE(S)", () => {
  it("uma única CONTRATANTE: singular, nome em negrito, sem 'as CONTRATANTES'", async () => {
    const buf = await generateContratoDocxBuffer(basePage());
    const xml = await extractDocumentXml(buf);
    expect(xml).toContain("Empresa Única LTDA");
    expect(xml).toContain("CONTRATANTE");
    expect(xml).not.toContain("CONTRATANTES");
  });

  it("duas CONTRATANTES: as duas empresas aparecem inteiras e o texto vai para o plural", async () => {
    const page = basePage({
      qualificacoesPartes: [
        "Empresa A LTDA, inscrita no CNPJ nº 11.111.111/0001-11, com sede em Rua A.",
        "Empresa B LTDA, inscrita no CNPJ nº 22.222.222/0001-22, com sede em Rua B.",
      ],
    });
    const buf = await generateContratoDocxBuffer(page);
    const xml = await extractDocumentXml(buf);
    // Achado real: antes desta correção, o texto da 2ª empresa era engolido
    // como "detalhe" da 1ª (split ingênuo na primeira vírgula do texto todo
    // já junto) — cada empresa precisa aparecer como sentença própria.
    expect(xml).toContain("Empresa A LTDA");
    expect(xml).toContain("com sede em Rua A");
    expect(xml).toContain("Empresa B LTDA");
    expect(xml).toContain("com sede em Rua B");
    expect(xml).toContain("CONTRATANTES");
  });
});

describe("generateContratoDocxBuffer — folha de assinaturas (16/11/2026)", () => {
  it("empilha escritório (Gustavo, Ricardo) e depois as empresas, sem rótulos CONTRATANTE/CONTRATADA", async () => {
    const page = basePage({
      contratantesAssinatura: [
        { nome: "NIGRO ALUMÍNIO LTDA.", documento: "43.948.561/0001-20", documentoTipo: "CNPJ" },
        { nome: "EMPRESA B LTDA", documento: "22.222.222/0001-22", documentoTipo: "CNPJ" },
      ],
    });
    const xml = await extractDocumentXml(await generateContratoDocxBuffer(page));
    const folha = xml.slice(xml.indexOf("PÁGINA DE ASSINATURAS"));
    const texto = [...folha.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("\n");
    const ordem = [
      "Gustavo Bismarchi Motta",
      "OAB/SP 275.477",
      "Ricardo Viscardi Pires",
      "OAB/SP 353.389",
      "NIGRO ALUMÍNIO LTDA.",
      "CNPJ/MF 43.948.561/0001-20",
      "EMPRESA B LTDA",
      "CNPJ/MF 22.222.222/0001-22",
    ].map((t) => texto.indexOf(t));
    expect(ordem.every((pos) => pos >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(texto.match(/Bismarchi \| Pires – Sociedade de Advogados/g)).toHaveLength(2);
    expect(texto).not.toMatch(/^CONTRATANTES?$|^CONTRATADA$/m);
    // Traço é a borda do próprio parágrafo do nome (parágrafo vazio com borda some no Word).
    expect(folha).toContain("<w:smallCaps/>");
  });
});
