import { describe, expect, it } from "vitest";
import { listContratoPendingFields, type ContratoPendingField } from "./contrato-docx-data";

type EngineArg = Parameters<typeof listContratoPendingFields>[2];

function engineWithObject(overrides: Partial<NonNullable<EngineArg>["contractObject"]> = {}): NonNullable<EngineArg> {
  return {
    scopes: [{ label: "Trabalhista — Contencioso", missingProfile: false }],
    contractObject: {
      missingScopeIds: [],
      missingRequiredFields: [],
      fieldValues: [],
      ...overrides,
    },
  };
}

function labels(pending: ContratoPendingField[]): string[] {
  return pending.map((p) => p.label);
}

function sectionOf(pending: ContratoPendingField[], label: string): string | null | undefined {
  return pending.find((p) => p.label === label)?.sectionId;
}

describe("listContratoPendingFields", () => {
  it("acusa empresa não identificada, apontando para a seção Partes", () => {
    const pending = listContratoPendingFields({}, "", null);
    expect(labels(pending)).toContain("Empresa (dados da proposta)");
    expect(sectionOf(pending, "Empresa (dados da proposta)")).toBe("section-partes");
  });

  it("sem motor canônico: Tipo de Instrumento e Objeto do Contrato (legado) continuam obrigatórios, sem seção associada", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      null,
    );
    expect(labels(pending)).toContain("Tipo de Instrumento");
    expect(labels(pending)).toContain("Objeto do Contrato");
    expect(sectionOf(pending, "Tipo de Instrumento")).toBeNull();
    expect(sectionOf(pending, "Objeto do Contrato")).toBeNull();
  });

  it("com motor canônico ativo: Tipo de Instrumento NÃO é mais obrigatório (não há input na UI para ele)", () => {
    // Regressão: antes desta correção, cc_tipo_instrumento ficava na lista "always"
    // mesmo com o motor ativo — como a seção "Avançado/legado" (única UI que o
    // preenchia) foi removida do builder, o campo virava uma pendência eterna e
    // impossível de resolver pela interface.
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engineWithObject(),
    );
    expect(labels(pending)).not.toContain("Tipo de Instrumento");
    expect(labels(pending)).not.toContain("Objeto do Contrato");
  });

  it("com motor canônico ativo: Tipo de pagamento continua obrigatório, apontando para Condições Comerciais", () => {
    const pending = listContratoPendingFields(
      {},
      "Empresa Teste Ltda",
      engineWithObject(),
    );
    expect(labels(pending)).toContain("Tipo de pagamento");
    expect(sectionOf(pending, "Tipo de pagamento")).toBe("section-condicoes");
  });

  it("acusa objeto incompleto quando há escopo sem perfil ou sem redação, apontando para a seção Objeto", () => {
    const engine: NonNullable<EngineArg> = {
      scopes: [{ label: "Cível — Padrão", missingProfile: true }],
      contractObject: {
        missingScopeIds: ["entry-1"],
        missingRequiredFields: [],
        fieldValues: [],
      },
    };
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engine,
    );
    const label = "Objeto do Contrato incompleto — há escopo sem redação contratual";
    expect(labels(pending)).toContain(label);
    expect(sectionOf(pending, label)).toBe("section-objeto");
  });

  it("lista campos obrigatórios do motor que ainda estão vazios, com sufixo * e apontando para a seção Objeto", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engineWithObject({
        fieldValues: [
          { key: "numero_processo", label: "Número do processo", value: "", required: true },
          { key: "vara_tribunal", label: "Vara / Tribunal", value: "1ª Vara Cível", required: true },
          { key: "observacao", label: "Observação", value: "", required: false },
        ],
      }),
    );
    expect(labels(pending)).toContain("Número do processo *");
    expect(labels(pending)).not.toContain("Vara / Tribunal *");
    expect(labels(pending)).not.toContain("Observação *");
    expect(sectionOf(pending, "Número do processo *")).toBe("section-objeto");
  });

  it("exige Valores e vencimento quando o pagamento não é Êxito puro, apontando para Condições Comerciais", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engineWithObject(),
    );
    expect(labels(pending)).toContain("Valores e vencimento");
    expect(sectionOf(pending, "Valores e vencimento")).toBe("section-condicoes");
  });

  it("não exige Valores e vencimento para pagamento por Êxito puro", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Êxito" },
      "Empresa Teste Ltda",
      engineWithObject(),
    );
    expect(labels(pending)).not.toContain("Valores e vencimento");
  });

  it("sem motor: exige seleção de ao menos uma área quando nenhum toggle está marcado", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      null,
    );
    expect(labels(pending)).toContain("Áreas de atuação (selecione ao menos uma)");
  });

  it("com motor: pede escopo herdado da proposta (não o toggle legado) quando não há nenhum escopo, apontando para Escopos", () => {
    const engine: NonNullable<EngineArg> = {
      scopes: [],
      contractObject: { missingScopeIds: [], missingRequiredFields: [], fieldValues: [] },
    };
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engine,
    );
    const label = "Escopos contratados (nenhum escopo herdado da proposta)";
    expect(labels(pending)).toContain(label);
    expect(labels(pending)).not.toContain("Áreas de atuação (selecione ao menos uma)");
    expect(sectionOf(pending, label)).toBe("section-escopos");
  });

  it("com motor: não pede escopo quando já existe ao menos um herdado da proposta", () => {
    const pending = listContratoPendingFields(
      { cc_tipo_pagamento: "Boleto" },
      "Empresa Teste Ltda",
      engineWithObject(),
    );
    expect(labels(pending)).not.toContain("Escopos contratados (nenhum escopo herdado da proposta)");
  });

  it("nunca retorna itens com label duplicado", () => {
    const pending = listContratoPendingFields({}, "", null);
    expect(pending.length).toBe(new Set(labels(pending)).size);
  });
});
