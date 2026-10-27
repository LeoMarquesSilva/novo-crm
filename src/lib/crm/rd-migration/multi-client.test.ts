import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/crm/crm-field-schema";

import {
  extractCeps,
  extractDocuments,
  extractEmails,
  extractParties,
  isValidCnpj,
  isValidCpf,
  splitPeopleNames,
} from "./documents";
import { comparableClientName, findRdMigrationDuplicates } from "./duplicates";
import { planRdMigration } from "./plan";
import { buildRdMigrationPrefill, parseRdAddress, rdEmpresasFromFields } from "./prefill";
import { readRdDeal } from "./rd-deal";
import { computeRdMigrationRequirements } from "./requirements";

// Documentos fictícios com dígito verificador válido (não são de clientes).
const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";
const CNPJ_A = "11.222.333/0001-81";

function dealWith(fields: Record<string, string | string[]>) {
  return readRdDeal({
    deal: {
      id: "deal-1",
      name: "FULANO E BELTRANO",
      deal_stage: { name: "Inclusão no Fluxo de Faturamento (FINANCEIRO)" },
      deal_custom_fields: Object.entries(fields).map(([label, value]) => ({ value, custom_field: { label } })),
    },
  })!;
}

const OPP = { nome: "FULANO E BELTRANO", haveraDueDiligence: false, linkProposta: null, linkContrato: null, d4signDocumentUuid: null };

describe("documentos do RD", () => {
  it("valida CPF e CNPJ pelo dígito verificador", () => {
    expect(isValidCpf(CPF_A)).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj(CNPJ_A)).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
  });

  it("separa vários documentos e descarta o digitado errado", () => {
    expect(extractDocuments(`${CPF_A}, ${CPF_B}`)).toEqual(["52998224725", "11144477735"]);
    expect(extractDocuments(`${CPF_A} / (11.444.777-35`)).toEqual(["52998224725"]);
    expect(extractDocuments(`${CNPJ_A} e ${CPF_A}`)).toEqual(["11222333000181", "52998224725"]);
    // Os dígitos de dois CPFs colados não viram um CNPJ.
    expect(extractDocuments("5299822472511144477735")).toEqual([]);
  });

  it("separa nomes, e-mails, partes e CEPs", () => {
    expect(splitPeopleNames("FULANO DE TAL, BELTRANO SILVA")).toEqual(["FULANO DE TAL", "BELTRANO SILVA"]);
    expect(splitPeopleNames("ACME LTDA")).toEqual(["ACME LTDA"]);
    expect(extractEmails("a@x.com / B@y.com.br")).toEqual(["a@x.com", "b@y.com.br"]);
    expect(extractParties(`FULANO DE TAL, CPF ${CPF_A} / BELTRANO SILVA, CPF nº ${CPF_B}`)).toEqual([
      { nome: "FULANO DE TAL", documento: "52998224725" },
      { nome: "BELTRANO SILVA", documento: "11144477735" },
    ]);
    expect(extractParties(`${CPF_A} - FULANO DE TAL; ${CPF_B} - BELTRANO SILVA`)).toEqual([
      { nome: "FULANO DE TAL", documento: "52998224725" },
      { nome: "BELTRANO SILVA", documento: "11144477735" },
    ]);
    expect(extractCeps("Rua A, 1, CEP 06544-515 / Rua B, 2, CEP 13010-000")).toEqual(["06544515", "13010000"]);
  });

  it("dois endereços no mesmo campo não preenchem CEP nem UF", () => {
    expect(parseRdAddress("Rua A, 1 - Barueri/SP, 06544-515 / Rua B, 2 - Campinas/SP, 13010-000")).toEqual({
      cep: "",
      uf: "",
      multiple: true,
    });
    expect(parseRdAddress("Rua A, 1 - Barueri/SP, 06544-515")).toEqual({ cep: "06544515", uf: "SP", multiple: false });
  });
});

describe("negócio do RD com dois clientes", () => {
  const fields = {
    "Razão Social [CP]": "FULANO DE TAL, BELTRANO SILVA",
    "CNPJ [CP]": `${CPF_A}, ${CPF_B}`,
    "Razão Social Cliente Principal [CADASTRO]": "FULANO DE TAL / BELTRANO SILVA",
    "CNPJ / CPF Cliente Principal [CADASTRO]": `${CPF_A} / ${CPF_B}`,
    "Endereço Cliente Principal [CADASTRO]": "Rua A, 1 - Barueri/SP, 06544-515 / Rua B, 2 - Campinas/SP, 13010-000",
    "Razão Social para Faturamento [FINANCEIRO]": "FULANO DE TAL",
    "CPF/CNPJ para Faturamento [FINANCEIRO]": `${CPF_A} / (11.444.777-35`,
    "Responsável Financeiro do Cliente [FINANCEIRO]": "Fulano / Beltrano",
    "E-mail Responsável Financeiro do Cliente [FINANCEIRO]": "fulano@example.com / beltrano@example.com",
    "Telefone Responsável Financeiro do Cliente [FINANCEIRO]": "(11) 99999-0000 / (11) 98888-0000",
    "E-mail do ponto focal / Comercial [CP]": "fulano@example.com / beltrano@example.com",
  };

  it("monta uma pessoa por CPF, tipo CPF", () => {
    const v = buildRdMigrationPrefill({ deal: dealWith(fields), opportunity: OPP });
    expect(v.cadastro.empresas).toEqual([
      { tipo_documento: "CPF", razao_social: "FULANO DE TAL", documento: "52998224725" },
      { tipo_documento: "CPF", razao_social: "BELTRANO SILVA", documento: "11144477735" },
    ]);
    expect(v.campos.cp_email_focal).toBeUndefined();
  });

  it("não cola documentos nem e-mails: deixa vazio e anota o que o RD tem", () => {
    const { onboarding } = buildRdMigrationPrefill({ deal: dealWith(fields), opportunity: OPP });
    expect(onboarding.cadastro).toMatchObject({ razaoSocial: "", documento: "" });
    expect(onboarding.cadastro.endereco).toMatchObject({ cep: "", uf: "" });
    expect(onboarding.cadastro.informacoesAdicionais).toContain("tem mais de um valor");
    expect(onboarding.financeiro.faturamento).toEqual({ tipo: "", razaoSocial: "", documento: "" });
    expect(onboarding.financeiro.contatoFinanceiro).toEqual({ nome: "", posicao: "", email: "", telefone: "" });
    expect(onboarding.financeiro.observacoes).toContain("fulano@example.com / beltrano@example.com");
    expect(onboarding.sources["financeiro.contatoFinanceiro"]).toBeUndefined();
  });

  it("com um valor só, preenche como antes", () => {
    const { onboarding, cadastro } = buildRdMigrationPrefill({
      deal: dealWith({
        "Razão Social [CP]": "ACME INDÚSTRIA, COMÉRCIO E SERVIÇOS LTDA",
        "CNPJ [CP]": CNPJ_A,
        "CPF/CNPJ para Faturamento [FINANCEIRO]": CNPJ_A,
        "Razão Social para Faturamento [FINANCEIRO]": "ACME LTDA",
        "E-mail Responsável Financeiro do Cliente [FINANCEIRO]": "Financeiro@Acme.com.br",
      }),
      opportunity: OPP,
    });
    // Vírgula no nome de uma empresa com um CNPJ só não divide a empresa.
    expect(cadastro.empresas).toEqual([
      { tipo_documento: "CNPJ", razao_social: "ACME INDÚSTRIA, COMÉRCIO E SERVIÇOS LTDA", documento: "11222333000181" },
    ]);
    expect(onboarding.cadastro).toMatchObject({ razaoSocial: "ACME INDÚSTRIA, COMÉRCIO E SERVIÇOS LTDA", documento: "11222333000181" });
    expect(onboarding.financeiro.faturamento).toEqual({ tipo: "", razaoSocial: "ACME LTDA", documento: "11222333000181" });
    expect(onboarding.financeiro.contatoFinanceiro.email).toBe("financeiro@acme.com.br");
  });

  it("Demais Razões sociais completa nomes e pessoas", () => {
    expect(
      rdEmpresasFromFields({
        razaoSocial: "FULANO DE TAL",
        documento: CPF_A,
        demaisRazoes: `BELTRANO SILVA, CPF ${CPF_B}`,
        fallbackNome: "x",
      }),
    ).toEqual([
      { tipo_documento: "CPF", razao_social: "FULANO DE TAL", documento: "52998224725" },
      { tipo_documento: "CPF", razao_social: "BELTRANO SILVA", documento: "11144477735" },
    ]);
    // CPF com digitação errada: a linha fica sem documento para o responsável conferir.
    expect(
      rdEmpresasFromFields({ razaoSocial: "FULANO DE TAL", documento: "529.982.247-24", demaisRazoes: "", fallbackNome: "x" }),
    ).toEqual([{ tipo_documento: "CNPJ", razao_social: "FULANO DE TAL", documento: "" }]);
  });

  it("pessoa extra sem documento vira pendência e o plano grava as duas como contratantes", () => {
    const values = buildRdMigrationPrefill({ deal: dealWith(fields), opportunity: OPP });
    values.cadastro.tipoLead = "Lead Ativa";
    values.cadastro.areasAnalise = ["Cível"];
    values.cadastro.localReuniao = "Escritório";
    values.cadastro.empresas[1].documento = "";
    const fieldDefinitions: FieldDefinition[] = [];
    const r = computeRdMigrationRequirements({ stage: "aguardando_cadastro", values, fieldDefinitions, responsibleAppUserId: "u" });
    expect(r.missing.map((i) => i.key)).toEqual(["cadastro.empresas.1", "evidencias.dataAssinatura"]);

    values.cadastro.empresas[1].documento = "11144477735";
    const requirements = computeRdMigrationRequirements({ stage: "aguardando_cadastro", values, fieldDefinitions, responsibleAppUserId: "u" });
    const plan = planRdMigration({
      mode: "convert",
      opportunity: { id: "opp", etapa: "contrato_assinado", vendaFechadaEm: null, solicitanteEmail: null },
      rdStage: "contrato_assinado",
      values,
      requirements,
      responsible: null,
      deal: null,
      actorEmail: "admin@x.com",
      now: "2026-10-25T12:00:00.000Z",
    });
    expect(plan.intake.empresas_json).toHaveLength(2);
    const escolha = JSON.parse(String(plan.fieldValues.find((f) => f.code === "cp_proposta_empresas_json")?.value));
    expect(escolha).toMatchObject({ primaryIndex: 1, contratantes: [2] });
  });
});

describe("mesmo cliente em dois negócios", () => {
  it("agrupa por CPF/CNPJ ou nome e sugere o mais adiantado", () => {
    const found = findRdMigrationDuplicates([
      { opportunityId: "venda", nome: "FULANO DE TAL", documentos: ["52998224725"], stage: "contrato_enviado", converted: false },
      { opportunityId: "pos", nome: "Fulano de Tal e Beltrano", documentos: ["52998224725", "11144477735"], stage: "inclusao_faturamento", converted: false },
      { opportunityId: "levva-1", nome: "LEVVA Ltda.", documentos: [], stage: "proposta_enviada", converted: false },
      { opportunityId: "levva-2", nome: "Levva", documentos: [], stage: "aguardando_cadastro", converted: false },
      { opportunityId: "levva-3", nome: "LEVVA", documentos: [], stage: "reuniao", converted: false },
      { opportunityId: "sozinho", nome: "ACME", documentos: ["11222333000181"], stage: "reuniao", converted: false },
    ]);
    expect(found.get("venda")).toEqual({ others: ["pos"], suggested: false, reason: "documento" });
    expect(found.get("pos")).toEqual({ others: ["venda"], suggested: true, reason: "documento" });
    expect(found.get("levva-2")).toMatchObject({ others: ["levva-1", "levva-3"], suggested: true, reason: "nome" });
    expect(found.get("levva-1")?.suggested).toBe(false);
    expect(found.has("sozinho")).toBe(false);
  });

  it("o já convertido é o que fica", () => {
    const found = findRdMigrationDuplicates([
      { opportunityId: "a", nome: "ACME", documentos: [], stage: "reuniao", converted: true },
      { opportunityId: "b", nome: "ACME", documentos: [], stage: "inclusao_faturamento", converted: false },
    ]);
    expect(found.get("a")?.suggested).toBe(true);
  });

  it("nome comparável ignora acento, caixa e sufixo societário", () => {
    expect(comparableClientName("Kremilin Indústria LTDA - ME")).toBe("kremilin industria");
  });
});
