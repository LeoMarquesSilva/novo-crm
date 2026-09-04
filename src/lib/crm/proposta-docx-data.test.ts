import { describe, expect, it } from "vitest";
import { PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO } from "@/data/proposta-tipos-catalog";
import {
  buildPropostaDocxTemplateData,
  buildPropostaLivePreview,
  buildPropostaPlainTextPreview,
  formatDataVigenciaProposta,
  splitEscopoTextForDocx,
  stripInvestimentoSectionHeading,
  withInvestimentoSectionHeading,
} from "./proposta-docx-data";

describe("withInvestimentoSectionHeading", () => {
  it("coloca Investimento acima do texto, sem duplicar", () => {
    expect(withInvestimentoSectionHeading("pagamento mensal")).toBe("Investimento\n\npagamento mensal");
    expect(withInvestimentoSectionHeading("Investimento\n\njá tem")).toBe("Investimento\n\njá tem");
    expect(stripInvestimentoSectionHeading("Investimento\n\npagamento mensal")).toBe("pagamento mensal");
  });
});

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
    expect(d.AREA).toBe("Cível");
    expect(d.ESCOPO_AREA).toMatch(/^1 processo:/);
    expect(d.ESCOPO_AREA).toContain("Recuperação de Créditos");
    expect(d.ESCOPO_AREA).toContain("Ajuizamento de ações de recuperação de crédito:");
    expect(d.INVESTIMENTO).toMatch(/^Investimento\n\n/);
    expect(d.INVESTIMENTO).toContain("3.000,00");
    expect(d.INVESTIMENTO).not.toContain("Cível");
    expect(d.INVESTIMENTO).not.toContain("Recuperação de Créditos");
    expect(d.INVESTIMENTO).not.toContain("1.000,00");
    expect(d.INVESTIMENTO).not.toContain("2.000,00");
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

  it("não exporta RESUMO enquanto a síntese estiver desligada", () => {
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
    expect(d.RESUMO).toBe("");
    expect(d.RESUMO_SINTESE).toBe("");
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
    expect(d.INVESTIMENTO).toContain("já incluídos os tributos incidentes");
  });

  it("INVESTIMENTO usa «não incluídos os tributos» quando a tributação é líquida", () => {
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
        cp_tributacao: "Valor Líquido de Tributos",
      },
      cpEscopoDetalheJson,
      generatedAt: new Date("2026-04-16T12:00:00"),
    });
    expect(d.INVESTIMENTO).toContain("não incluídos os tributos incidentes");
    expect(d.INVESTIMENTO).not.toContain("já incluídos os tributos incidentes");
  });

  it("INVESTIMENTO junta várias formas de pagamento do documento consolidado", () => {
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
      },
      __investimentoDocumento__: {
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1.000,00" },
        autoSum: false,
        items: [
          {
            id: "a",
            tipoId: "honorarios_contratuais",
            subtipoId: "mensal_fixo",
            placeholders: { VALORMENSAL: "1.000,00" },
            autoSum: false,
          },
          {
            id: "b",
            tipoId: "honorarios_exito",
            subtipoId: "exito_percentual",
            placeholders: {
              PORCENTAGEMHONORARIOS: "10",
              BASECALCULO: "o benefício econômico obtido",
            },
          },
        ],
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
    expect(d.INVESTIMENTO).toContain("pagamento mensal de R$ 1.000,00");
    expect(d.INVESTIMENTO).toContain("êxito no percentual de 10%");
  });

  it("dois escopos na mesma área usam nome do subtipo como cabeçalho", () => {
    const cpEscopoDetalheJson = JSON.stringify({
      Cível: [
        {
          id: "a",
          tipoId: "contencioso",
          subtipoId: "um_processo",
          placeholders: {
            [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]: "Resumo A",
            "NOME EMPRESA": "ACME",
            "TIPO DA AÇÃO": "Ação A",
            "NUM. DO PROCESSO": "0000000-00.0000.0.00.0000",
            PARTE_CONTRÁRIA: "Autor",
            VALOR_CAUSA: "1000",
          },
        },
        {
          id: "b",
          tipoId: "contencioso",
          subtipoId: "mais_um_processo",
          placeholders: {
            "NOME EMPRESA": "ACME",
            "QTD DE PROCESSOS": "3",
          },
        },
      ],
    });

    const { page, templateData } = buildPropostaLivePreview({
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

    expect(page.escopoSections).toHaveLength(2);
    expect(page.escopoSections[0]?.areaLabel).toBe("Cível");
    expect(page.escopoSections[0]?.scopeTypeLabel).toBe("1 processo");
    expect(page.escopoSections[1]?.areaLabel).toBe("Cível");
    expect(page.escopoSections[1]?.scopeTypeLabel).toBe("+1 processo");
    expect(templateData.AREA).toBe("Cível");
    expect(page.resumo).toBe("");
    expect(templateData.ESCOPO_AREA).toMatch(/^1 processo:/);
    expect(templateData.ESCOPO_AREA).toContain("+1 processo:");
    expect(templateData.ESCOPO_AREA).not.toMatch(/^Cível\n/);
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
    expect(t).not.toContain("Síntese da demanda");
    expect(t).not.toContain("Resumo X");
    expect(t).toContain("Investimento");
    expect(t).toContain("R$ 1,00");
    expect(t).toContain("Data de vigência proposta: 23/04/2026");
    expect(t).toContain("Cordialmente,");
  });
});
