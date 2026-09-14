import { describe, expect, it } from "vitest";
import { getPropostaPlaceholderFieldConfig } from "./proposta-placeholder-labels";

describe("getPropostaPlaceholderFieldConfig", () => {
  it.each([
    ["Valor da Hora Adicional", "Valor da hora adicional"],
    ["Vlr adcional de processo", "Valor adicional por processo"],
    ["VALORHORAEXCEDENTE", "Valor da hora excedente"],
    ["NOME_SOCIO_DISSIDENTE", "Nome do sócio dissidente"],
    ["FINALIDADE_ALTERACAO_CONTRATUAL", "Finalidade da alteração contratual"],
    ["LIMITE_PROCESSOS_ATIVOS", "Limite de processos ativos"],
    ["LIMITE_HORAS", "Limite de horas mensais"],
    ["QTD_DE_ACOES", "Quantidade de ações"],
    ["NOME_EMPRESA_OU_GRUPO", "Nome da empresa ou grupo"],
    ["EMPRESA_ALVO", "Empresa-alvo"],
    ["CNPJ_ALVO", "CNPJ da empresa-alvo"],
    ["NUM_PROCESSO_RJ", "Número do processo de recuperação judicial"],
    ["VARA_RJ", "Vara do processo de recuperação judicial"],
    ["PARCEIRO_COMERCIAL", "Parceiro comercial"],
    ["PARTE_NOTIFICADA", "Parte notificada"],
    ["OBJETO_DA_ANALISE", "Objeto da análise"],
    ["EMPRESA_CONTRAPARTE", "Empresa contraparte"],
    ["PRAZO_ELABORACAO", "Prazo de elaboração em dias úteis"],
  ])("apresenta um rótulo amigável para %s", (key, label) => {
    expect(getPropostaPlaceholderFieldConfig(key).label).toBe(label);
  });

  it.each([
    ["Valor da Hora Adicional"],
    ["Vlr adcional de processo"],
    ["VALORHORAEXCEDENTE"],
    ["VALOR_CAUSA"],
  ])("usa campo monetário para %s", (key) => {
    expect(getPropostaPlaceholderFieldConfig(key)).toMatchObject({
      control: "currency",
      placeholder: "R$ 0,00",
    });
  });

  it.each([
    ["HORAS_MES", "Ex.: 12"],
    ["LIMITE_HORAS", "Ex.: 20"],
    ["LIMITE_PROCESSOS_ATIVOS", "Ex.: 10"],
    ["QTD DE PROCESSOS", "Ex.: 5"],
    ["QTD_DE_ACOES", "Ex.: 3"],
    ["PRAZO_ELABORACAO", "Ex.: 15"],
  ])("usa campo numérico com exemplo específico para %s", (key, placeholder) => {
    expect(getPropostaPlaceholderFieldConfig(key)).toMatchObject({
      control: "integer",
      placeholder,
    });
  });

  it("usa máscara de CNPJ para a empresa-alvo", () => {
    expect(getPropostaPlaceholderFieldConfig("CNPJ_ALVO").control).toBe("cnpj");
  });

  it.each([["NUM. DO PROCESSO"], ["NUM_PROCESSO_RJ"]])(
    "usa máscara processual para %s",
    (key) => {
      expect(getPropostaPlaceholderFieldConfig(key).control).toBe("process");
    },
  );

  it.each([["NOME EMPRESA"], ["NOME_EMPRESA"]])(
    "preenche aliases da empresa principal para %s",
    (key) => {
      expect(getPropostaPlaceholderFieldConfig(key).autoFillFromCompany).toBe(true);
    },
  );

  it("trata novos placeholders de valor como monetários por padrão", () => {
    expect(getPropostaPlaceholderFieldConfig("VALOR_SERVICO_EXTRA")).toMatchObject({
      control: "currency",
      placeholder: "R$ 0,00",
    });
  });

  it("humaniza chaves desconhecidas sem expor o token técnico", () => {
    expect(getPropostaPlaceholderFieldConfig("NOVO_CAMPO_CLIENTE")).toEqual({
      label: "Novo campo cliente",
      control: "text",
      placeholder: "Digite novo campo cliente",
    });
  });
});
