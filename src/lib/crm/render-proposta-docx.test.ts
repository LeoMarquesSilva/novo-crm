import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildPropostaDocxTemplateData } from "./proposta-docx-data";
import {
  boldLeadingLabelsInParagraphs,
  convertSoftBreaksToParagraphs,
  renderPropostaDocx,
  restyleMatchingAreaHeadings,
} from "./render-proposta-docx";
import PizZip from "pizzip";

describe("convertSoftBreaksToParagraphs", () => {
  it("parte um parágrafo justificado em vários, sem mexer em quebra de página", () => {
    const xml = [
      '<w:p><w:pPr><w:jc w:val="both"/></w:pPr>',
      "<w:r><w:t>Escopo um.</w:t></w:r>",
      "<w:r><w:br/></w:r>",
      "<w:r><w:t>Escopo dois.</w:t></w:r>",
      "</w:p>",
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    ].join("");

    const out = convertSoftBreaksToParagraphs(xml);
    expect(out).toContain(">Escopo um.</w:t>");
    expect(out).toContain(">Escopo dois.</w:t>");
    expect(out).toContain('w:type="page"');
    expect(out).not.toMatch(/<w:br\/>/);
  });
});

describe("restyleMatchingAreaHeadings", () => {
  it("alinha à esquerda e destaca o nome da área", () => {
    const xml =
      '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Cível</w:t></w:r></w:p>';
    const out = restyleMatchingAreaHeadings(xml, new Set(["cível"]));
    expect(out).toContain('w:val="left"');
    expect(out).toContain("<w:b/>");
  });
});

describe("boldLeadingLabelsInParagraphs", () => {
  it("deixa só o subtipo em negrito, com o texto a seguir", () => {
    const xml =
      '<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>+1 processo: Visando a atender as necessidades.</w:t></w:r></w:p>';
    const out = boldLeadingLabelsInParagraphs(xml, ["+1 processo"]);
    expect(out).toContain("<w:b/>");
    expect(out).toContain("+1 processo: ");
    expect(out).toContain("Visando a atender as necessidades.");
    expect(out.match(/<w:r\b/g)?.length).toBe(2);
  });
});

describe("renderPropostaDocx contra o modelo real", () => {
  const templatePath = path.resolve(process.cwd(), "public/MODELO-PROPOSTA-1.docx");
  const hasTemplate = fs.existsSync(templatePath);

  it.skipIf(!hasTemplate)("mantém área no topo e subtipo na frente do texto", () => {
    const data = buildPropostaDocxTemplateData({
      empresasIntake: [
        { index: 1, razao_social: "ACME Ltda", tipo_documento: "CNPJ", documento: "12345678000199" },
      ],
      cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
      fieldByCode: {
        cp_areas_objeto: "Cível",
        cp_cliente_cidade: "Campinas",
        cp_cliente_uf: "SP",
        cp_cliente_cep: "13025000",
        cp_cliente_numero: "100",
      },
      cpEscopoDetalheJson: JSON.stringify({
        Cível: [
          {
            id: "a",
            tipoId: "contencioso",
            subtipoId: "um_processo",
            placeholders: {
              RESUMO_DO_PROCESSO: "Resumo 1",
              "NOME EMPRESA": "ACME Ltda",
              "TIPO DA AÇÃO": "Ação X",
              "NUM. DO PROCESSO": "0000000-00.0000.0.00.0000",
              PARTE_CONTRÁRIA: "Autor",
              VALOR_CAUSA: "1000",
            },
          },
          {
            id: "b",
            tipoId: "contencioso",
            subtipoId: "mais_um_processo",
            placeholders: { "NOME EMPRESA": "ACME Ltda", "QTD DE PROCESSOS": "4" },
          },
        ],
      }),
      generatedAt: new Date("2026-08-31T12:00:00"),
    });

    const out = renderPropostaDocx(fs.readFileSync(templatePath), data);
    const xml = new PizZip(out).file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("Visando a atender");
    expect(xml).toContain("4 processos judiciais");
    expect(xml).toContain("1 processo: ");
    expect(xml).toContain("+1 processo: ");
    expect(xml).toMatch(/<w:t[^>]*>Cível<\/w:t>/);
  });
});
