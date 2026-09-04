import fs from "node:fs";
import path from "node:path";
import { buildCanonicalProposalData, type PropostaDocxTemplateInput } from "../src/lib/crm/proposta-docx-data";
import { renderCanonicalProposalDocx } from "../src/lib/crm/render-proposta-docx";

/** Local fixture only. No network, CRM writes, or contact with the named company. */
const input: PropostaDocxTemplateInput = {
  empresasIntake: [{ index: 1, razao_social: "Zincatec Galvanoplastia", tipo_documento: "CNPJ", documento: "12345678000199" }],
  cpPropostaEmpresasJson: undefined,
  responsavel: "Responsável de teste",
  generatedAt: new Date("2026-09-02T15:00:00Z"),
  fieldByCode: { cp_areas_objeto: "Trabalhista, Societário e Contratos", cp_tributacao: "inclusos" },
  cpEscopoDetalheJson: JSON.stringify({
    Trabalhista: [
      { id: "t1", tipoId: "contencioso", subtipoId: "acoes", placeholders: { LIMITE: "20" }, investimento: { tipoId: "honorarios_contratuais", subtipoId: "mensal_fixo", placeholders: { VALORMENSAL: "19100.48" } } },
      { id: "t2", tipoId: "consultivo", subtipoId: "consultivo", placeholders: { HORAS: "12" } },
    ],
    "Societário e Contratos": [{ id: "s1", tipoId: "societario", subtipoId: "acordo", placeholders: {} }],
  }),
  scopeCatalog: {
    Trabalhista: [
      { tipoId: "contencioso", label: "Contencioso", subtipos: [{ subtipoId: "acoes", label: "Contencioso - Acompanhamento de Ação Judicial", escopoTemplate: "Defesa dos interesses da Cliente e seus sócios nas respectivas demandas de natureza trabalhista já ajuizadas e das que ainda serão ajuizadas. Atuação limitada a [LIMITE] processos.", placeholderKeys: ["LIMITE"] }] },
      { tipoId: "consultivo", label: "Consultivo", subtipos: [{ subtipoId: "consultivo", label: "Consultivo", escopoTemplate: "Gestão e prevenção de riscos ao patrimônio e ao fluxo de caixa da Cliente, mediante atuação consultiva. Atuação limitada a [HORAS] horas por mês.\n\nA atuação consultiva é pautada na elaboração de pareceres, estratégias jurídicas preventivas e eficientes, com foco na gestão organizacional e solução extrajudicial.\n\nConsiste em um desempenho consultivo na administração empresarial, com o intuito de examinar e revisar a integridade, confiabilidade e cumprimento da legislação, políticas internas, normas coletivas, contratos trabalhistas e demais regulamentos dos sistemas de trabalho implementados pelo negócio.", placeholderKeys: ["HORAS"] }] },
    ],
    "Societário e Contratos": [{ tipoId: "societario", label: "Societário", subtipos: [{ subtipoId: "acordo", label: "Acordo de Sócios", escopoTemplate: "Elaboração de Acordo de Sócios, prevendo regras de governança, direitos e obrigações dos sócios, entrada e saída, direito de preferência, solução de impasses e recomposição societária.", placeholderKeys: [] }] }],
  },
};

const output = path.resolve("tmp/proposta-engine");
fs.mkdirSync(output, { recursive: true });
const data = buildCanonicalProposalData(input);
fs.writeFileSync(path.join(output, "Zincatec-proposta.docx"), renderCanonicalProposalDocx(data));
const large = { ...data, escopoSections: data.escopoSections.map(s => ({ ...s, text: Array(10).fill(s.text).join("\n\n") })) };
fs.writeFileSync(path.join(output, "Zincatec-escopo-longo.docx"), renderCanonicalProposalDocx(large));
console.log("Fixture gerada: Zincatec-proposta.docx e Zincatec-escopo-longo.docx");
