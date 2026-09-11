import { describe, expect, it } from "vitest";
import { PROPOSTA_INVESTIMENTO_TIPOS_CATALOG } from "@/data/proposta-investimento-catalog";
import { PROPOSTA_TIPOS_CATALOG } from "@/data/proposta-tipos-catalog";
import { buildPropostaDocxTemplateData } from "./proposta-docx-data";
import { listProposalPendingFields } from "./proposta-document-validation";

const completeScope = {
  "Recuperação de Créditos": [{
    id: "scope-1", tipoId: "recuperacao_credito", subtipoId: "ajuizamento_recuperacao",
    placeholders: { "NOME EMPRESA": "ACME Ltda" },
    investimento: { tipoId: "honorarios_contratuais", subtipoId: "mensal_fixo", placeholders: { VALORMENSAL: "2000" } },
  }],
};

function pendingFor(fieldByCode: Record<string, string>, responsavel = "Maria Silva") {
  const templateData = buildPropostaDocxTemplateData({
    empresasIntake: [{ index: 1, razao_social: "ACME Ltda", tipo_documento: "CNPJ", documento: "12345678000199" }],
    cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
    fieldByCode,
    cpEscopoDetalheJson: fieldByCode.cp_escopo_detalhe_json ?? "",
    generatedAt: new Date("2026-09-02T12:00:00Z"),
  });
  return listProposalPendingFields({
    fieldByCode, templateData, responsavel,
    templateFields: [
      { fieldCode: "cp_cliente_cidade", label: "Cidade", isRequired: true },
      { fieldCode: "cp_escopo_detalhe_json", label: "Escopo", isRequired: true },
    ],
    scopeCatalog: PROPOSTA_TIPOS_CATALOG,
    investmentCatalog: PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  });
}

const validDraft = () => ({
  cp_cliente_cidade: "Curitiba", cp_areas_objeto: "Recuperação de Créditos",
  cp_escopo_detalhe_json: JSON.stringify(completeScope),
});

describe("listProposalPendingFields", () => {
  it("remove pendências quando o rascunho é preenchido, antes de persistir", () => {
    expect(pendingFor({})).toContain("Cidade");
    expect(pendingFor({})).toContain("Escopo");
    expect(pendingFor(validDraft())).toEqual([]);
  });
  it("volta a bloquear ao apagar um campo obrigatório no rascunho", () => {
    expect(pendingFor({ ...validDraft(), cp_cliente_cidade: "  " })).toContain("Cidade");
  });
  it("revalida o conteúdo interno do escopo atual mesmo com JSON não vazio", () => {
    const invalid = structuredClone(completeScope);
    invalid["Recuperação de Créditos"][0].placeholders["NOME EMPRESA"] = "";
    expect(pendingFor({ ...validDraft(), cp_escopo_detalhe_json: JSON.stringify(invalid) })).toContain("Escopo");
  });
  it("exige Enviado por sem inserir um responsável padrão", () => {
    expect(pendingFor(validDraft(), " ")).toEqual(["Enviado por"]);
  });
});
