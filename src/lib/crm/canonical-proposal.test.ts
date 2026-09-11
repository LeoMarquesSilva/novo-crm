import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildCanonicalProposalData, type PropostaDocxTemplateInput } from "./proposta-docx-data";
import { readModeloPropostaTemplateBuffer, renderCanonicalProposalDocx } from "./render-proposta-docx";

const input: PropostaDocxTemplateInput = {
  empresasIntake: [{ index: 1, razao_social: "Zincatec Galvanoplastia", tipo_documento: "CNPJ", documento: "12345678000199" }],
  fieldByCode: { cp_areas_objeto: "Trabalhista, Societário e Contratos", cp_tributacao: "inclusos" },
  cpPropostaEmpresasJson: undefined,
  cpEscopoDetalheJson: JSON.stringify({
    Trabalhista: [{ id: "t1", tipoId: "contencioso", subtipoId: "mais_um_processo", placeholders: { "QTD DE PROCESSOS": "20" }, investimento: { tipoId: "honorarios_contratuais", subtipoId: "mensal_fixo", placeholders: { VALORMENSAL: "19100.48" } } }],
  }),
  responsavel: "Responsável do CRM",
  scopeCatalog: { Trabalhista: [{ tipoId: "contencioso", label: "Contencioso", subtipos: [{ subtipoId: "mais_um_processo", label: "Acompanhamento de Ação Judicial", escopoTemplate: "Defesa dos interesses da Cliente. Atuação limitada a [QTD DE PROCESSOS] processos.", placeholderKeys: ["QTD DE PROCESSOS"] }] }] },
  generatedAt: new Date("2026-09-02T01:00:00Z"),
};

describe("proposta canônica BP", () => {
  it("tem template privado obrigatório, marcadores e estilos Word", () => {
    const bytes = readModeloPropostaTemplateBuffer();
    expect(fs.existsSync(path.resolve("templates/proposta/PROPOSTA-BP-V1.docx"))).toBe(true);
    const zip = new PizZip(bytes);
    const xml = zip.file("word/document.xml")!.asText();
    for (const tag of ["EMPRESA", "RESPONSAVEL", "DATA_PROPOSTA", "@ESCOPO_AREAS", "@INVESTIMENTO", "DATA_VIGENCIA"]) expect(xml).toContain(`[${tag}]`);
    expect(zip.file("word/styles.xml")!.asText()).toContain('w:styleId="BPScopeBody"');
    expect(xml).not.toContain("08/09/2026");
  });

  it("centraliza empresa, responsável e datas de São Paulo (+7 dias)", () => {
    const data = buildCanonicalProposalData(input);
    expect(data.templateData.EMPRESA).toBe("Zincatec Galvanoplastia");
    expect(data.templateData.RESPONSAVEL).toBe("Responsável do CRM");
    expect(data.templateData.DATA_PROPOSTA).toBe("1 de setembro de 2026");
    expect(data.templateData.DATA_VIGENCIA).toBe("08/09/2026");
    expect(data.generatedAt).toBe(input.generatedAt.toISOString());
  });

  it("preenche DOCX determinístico, preserva mídias/relationships e escapa texto do CRM", () => {
    const data = buildCanonicalProposalData({ ...input, responsavel: 'Maria & João <Equipe>' });
    const original = new PizZip(readModeloPropostaTemplateBuffer());
    const bytes = renderCanonicalProposalDocx(data);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.equals(renderCanonicalProposalDocx(data))).toBe(true);
    const generated = new PizZip(bytes);
    const xml = generated.file("word/document.xml")!.asText();
    expect(xml).toContain("Zincatec Galvanoplastia");
    expect(xml).toContain("Maria &amp; João &lt;Equipe&gt;");
    expect(xml).toContain("19.100,48");
    expect(xml).toContain("dezenove mil");
    expect(xml).toContain("BPScopeArea");
    expect(xml).not.toMatch(/\[(?:@?ESCOPO_AREAS|@?INVESTIMENTO|EMPRESA|RESPONSAVEL|DATA_PROPOSTA|DATA_VIGENCIA)\]/);
    for (const name of Object.keys(original.files).filter(n => n.startsWith("word/media/") || n.endsWith(".rels") || /word\/(header|footer)\d+\.xml/.test(n))) {
      const hash = (value: Uint8Array | undefined) => value && createHash("sha256").update(value).digest("hex");
      expect(hash(generated.file(name)?.asUint8Array())).toBe(hash(original.file(name)?.asUint8Array()));
    }
  }, 60_000);

  it("escopo vazio não inventa conteúdo; seis áreas fluem em parágrafos Word", () => {
    const empty = buildCanonicalProposalData({ ...input, fieldByCode: {}, cpEscopoDetalheJson: "{}", responsavel: "" });
    expect(empty.escopoSections).toEqual([]);
    expect(empty.templateData.RESPONSAVEL).toBe("");
    const many = { ...empty, escopoSections: Array.from({ length: 6 }, (_, i) => ({ areaLabel: `Área ${i + 1}`, scopeTypeLabel: "Consultivo", label: "Consultivo", text: "Texto longo & válido.\n\nOutro parágrafo.".repeat(40) })) };
    const xml = new PizZip(renderCanonicalProposalDocx(many)).file("word/document.xml")!.asText();
    for (let i = 1; i <= 6; i++) expect(xml).toContain(`Área ${i}`);
    expect(xml).toContain("Texto longo &amp; válido.");
    expect(xml).not.toContain("[ESCOPO_AREAS]");
  });
});
