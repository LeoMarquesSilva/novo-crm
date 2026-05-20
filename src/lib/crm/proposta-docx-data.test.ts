import { describe, expect, it } from "vitest";
import { PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO } from "@/data/proposta-tipos-catalog";
import {
  buildPropostaDocxTemplateData,
  buildPropostaPlainTextPreview,
  formatDataVigenciaProposta,
  splitEscopoTextForDocx,
} from "./proposta-docx-data";

describe("splitEscopoTextForDocx", () => {
  it("separa texto após o marcador «Síntese da demanda:»", () => {
    const s = `Parágrafo um.\n\nSíntese da demanda: resumo aqui.`;
    expect(splitEscopoTextForDocx(s)).toEqual({
      antesSintese: "Parágrafo um.",
      resumoSintese: "resumo aqui.",
    });
  });

  it("sem marcador devolve tudo em antes e resumo vazio", () => {
    expect(splitEscopoTextForDocx("Só escopo.")).toEqual({
      antesSintese: "Só escopo.",
      resumoSintese: "",
    });
  });

  it("concatena escopo e investimento de múltiplas áreas", () => {
    const cpEscopoDetalheJson = JSON.stringify({
      "Cível": {
        tipoId: "contencioso",
        subtipoId: "um_processo",
        placeholders: {
          [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]: "Resumo cível",
          "NOME EMPRESA": "ACME",
          "TIPO DA AÇÃO": "Ação Cível",
          "NUM. DO PROCESSO": "0000000-00.0000.0.00.0000",
          "PARTE_CONTRÁRIA": "Autor",
          VALOR_CAUSA: "1000",
        },
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "1000" },
        },
      },
      "Recuperação de Créditos": {
        tipoId: "recuperacao_credito",
        subtipoId: "ajuizamento_recuperacao",
        placeholders: {
          "NOME EMPRESA": "ACME",
        },
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "2000" },
        },
      },
    });

    const d = buildPropostaDocxTemplateData({
      empresasIntake: [
        {
          index: 1,
          razao_social: "ACME Ltda",
          tipo_documento: "CNPJ",
          documento: "12345678000199",
        },
      ],
      cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
      fieldByCode: {
        cp_areas_objeto: "Cível, Recuperação de Créditos",
        cp_cliente_cidade: "São Paulo",
        cp_cliente_uf: "SP",
        cp_cliente_cep: "01310100",
        cp_cliente_numero: "100",
      },
      cpEscopoDetalheJson,
      generatedAt: new Date("2026-04-16T12:00:00"),
    });

    expect(d.AREAS).toBe("Cível, Recuperação de Créditos");
    expect(d.ESCOPO_AREA).toContain("Cível");
    expect(d.ESCOPO_AREA).toContain("Recuperação de Créditos");
    expect(d.INVESTIMENTO).toContain("1.000,00");
    expect(d.INVESTIMENTO).toContain("2.000,00");
  });
});

describe("formatDataVigenciaProposta", () => {
  it("adiciona 7 dias em formato dd/MM/yyyy", () => {
    expect(formatDataVigenciaProposta(new Date("2026-04-16T15:00:00"))).toBe("23/04/2026");
  });
});

describe("buildPropostaDocxTemplateData", () => {
  it("preenche empresa, endereço e primeira área", () => {
    const d = buildPropostaDocxTemplateData({
      empresasIntake: [
        {
          index: 1,
          razao_social: "ACME Ltda",
          tipo_documento: "CNPJ",
          documento: "12345678000199",
        },
      ],
      cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
      fieldByCode: {
        cp_areas_objeto: "Cível, Trabalhista",
        cp_cliente_cidade: "São Paulo",
        cp_cliente_uf: "SP",
        cp_cliente_cep: "01310100",
        cp_cliente_numero: "100",
      },
      cpEscopoDetalheJson: "{}",
      generatedAt: new Date("2026-04-16T12:00:00"),
    });
    expect(d.EMPRESA).toBe("ACME Ltda");
    expect(d.AREA).toBe("Cível");
    expect(d.CIDADE).toBe("São Paulo");
    expect(d.UF).toBe("SP");
    expect(d.CEP).toBe("01310-100");
    expect(d.NUMERO).toBe("100");
    expect(d.DOCUMENTO.length).toBeGreaterThan(10);
    expect(d["DATA VIGENCIA"]).toBe("23/04/2026");
    expect(d.P).toBe("1");
    expect(d.F).toBe("1");
    expect(d.RESUMO).toBe("");
    expect(d.RESUMO).toBe(d.RESUMO_SINTESE);
  });

  it("RESUMO vem do placeholder do CRM, sem repetir «Síntese da demanda» no escopo", () => {
    const cpEscopoDetalheJson = JSON.stringify({
      Cível: {
        tipoId: "contencioso",
        subtipoId: "um_processo",
        placeholders: {
          [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]: "Só o texto da síntese",
          "NOME EMPRESA": "ACME",
          "TIPO DA AÇÃO": "Ação X",
          "NUM. DO PROCESSO": "0000000-00.0000.0.00.0000",
          PARTE_CONTRÁRIA: "Autor",
          VALOR_CAUSA: "R$ 1,00",
        },
      },
    });
    const d = buildPropostaDocxTemplateData({
      empresasIntake: [
        {
          index: 1,
          razao_social: "ACME Ltda",
          tipo_documento: "CNPJ",
          documento: "12345678000199",
        },
      ],
      cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
      fieldByCode: {
        cp_areas_objeto: "Cível",
        cp_cliente_cidade: "São Paulo",
        cp_cliente_uf: "SP",
        cp_cliente_cep: "01310100",
        cp_cliente_numero: "100",
      },
      cpEscopoDetalheJson,
      generatedAt: new Date("2026-04-16T12:00:00"),
    });
    expect(d.RESUMO).toBe("Só o texto da síntese");
    expect(d.ESCOPO_AREA).not.toContain("Síntese da demanda");
    expect(d.ESCOPO_AREA).not.toContain("Só o texto da síntese");
  });

  it("INVESTIMENTO vem do bloco investimento no JSON (primeira área)", () => {
    const cpEscopoDetalheJson = JSON.stringify({
      Cível: {
        tipoId: "contencioso",
        subtipoId: "um_processo",
        placeholders: {
          [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]: "Resumo",
          "NOME EMPRESA": "ACME",
          "TIPO DA AÇÃO": "Ação X",
          "NUM. DO PROCESSO": "0000000-00.0000.0.00.0000",
          PARTE_CONTRÁRIA: "Autor",
          VALOR_CAUSA: "1000",
        },
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "1500,50" },
        },
      },
    });
    const d = buildPropostaDocxTemplateData({
      empresasIntake: [
        {
          index: 1,
          razao_social: "ACME Ltda",
          tipo_documento: "CNPJ",
          documento: "12345678000199",
        },
      ],
      cpPropostaEmpresasJson: JSON.stringify({ primaryIndex: 1, extras: [] }),
      fieldByCode: {
        cp_areas_objeto: "Cível",
        cp_cliente_cidade: "São Paulo",
        cp_cliente_uf: "SP",
        cp_cliente_cep: "01310100",
        cp_cliente_numero: "100",
      },
      cpEscopoDetalheJson,
      generatedAt: new Date("2026-04-16T12:00:00"),
    });
    expect(d.INVESTIMENTO).toContain("1.500,50");
    expect(d.INVESTIMENTO.toLowerCase()).toContain("quinhentos");
    expect(d.INVESTIMENTO).toContain("pagamento mensal de R$");
  });
});

describe("buildPropostaPlainTextPreview", () => {
  it("monta texto corrido com os mesmos campos do Word", () => {
    const t = buildPropostaPlainTextPreview({
      EMPRESA: "ACME",
      CIDADE: "São Paulo",
      UF: "SP",
      CEP: "01310-100",
      NUMERO: "100",
      DOCUMENTO: "12.345.678/0001-99",
      AREA: "Cível",
      ESCOPO_AREA: "Escopo livre",
      RESUMO: "Resumo X",
      INVESTIMENTO: "R$ 1,00",
      "DATA VIGENCIA": "23/04/2026",
    });
    expect(t).toContain("À ACME");
    expect(t).toContain("Objeto da Proposta");
    expect(t).toContain("Cível");
    expect(t).toContain("Escopo livre");
    expect(t).toContain("Síntese da demanda: Resumo X");
    expect(t).toContain("R$ 1,00");
    expect(t).toContain("Data de vigência proposta: 23/04/2026");
    expect(t).toContain("Cordialmente,");
  });
});
