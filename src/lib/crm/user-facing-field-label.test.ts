import { describe, expect, it } from "vitest";
import {
  userFacingActivityTitle,
  userFacingFieldLabel,
} from "./user-facing-field-label";

describe("rótulos públicos de campos", () => {
  it("mapeia campos JSON conhecidos sem expor detalhes internos", () => {
    expect(
      userFacingFieldLabel(
        "Escopo detalhado por área (JSON) [CP]",
        "cp_escopo_detalhe_json",
      ),
    ).toBe("Escopo detalhado por área");
  });

  it("remove os sufixos técnicos usados pelas diferentes áreas", () => {
    expect(userFacingFieldLabel("Razão Social [CP]")).toBe("Razão Social");
    expect(userFacingFieldLabel("Início da Vigência [FINANCEIRO]")).toBe(
      "Início da Vigência",
    );
    expect(userFacingFieldLabel("Prazo de Entrega [DATA]")).toBe("Prazo de Entrega");
    expect(userFacingFieldLabel("Rateio (Trabalhista) - [CC]")).toBe(
      "Rateio (Trabalhista)",
    );
  });

  it("tira o (DD) da reunião da due diligence e acentua o que veio do RD", () => {
    expect(userFacingFieldLabel("Data da Reuniao (DD)", "data_reuniao_dd")).toBe("Data da Reunião");
    expect(userFacingFieldLabel("Horario da Reuniao (DD)", "horario_dd")).toBe("Horário da Reunião");
    expect(userFacingFieldLabel("Inicio da Vigencia do Contrato [FINANCEIRO]")).toBe("Início da Vigência do Contrato");
    expect(userFacingFieldLabel("Areas de Analise")).toBe("Áreas de Análise");
    expect(userFacingFieldLabel("Havera Due Diligence?")).toBe("Haverá Due Diligence?");
  });

  it("tira a caixa alta de palavras comuns e mantém as siglas", () => {
    expect(userFacingFieldLabel("STATUS [CADASTRO]")).toBe("Status");
    expect(userFacingFieldLabel("RATEIO R$ - Civel [FINANCEIRO]")).toBe("Rateio R$ - Cível");
    expect(userFacingFieldLabel("CNPJ / CPF Cliente Principal [CADASTRO]")).toBe("CNPJ / CPF Cliente Principal");
    expect(userFacingFieldLabel("SPOT - Valor R$ [CC]")).toBe("SPOT - Valor R$");
    expect(userFacingFieldLabel("Link do Arquivo DUE")).toBe("Link do Arquivo DUE");
  });

  it("rótulo já limpo passa sem mudança", () => {
    expect(userFacingFieldLabel("Data da Reunião")).toBe("Data da Reunião");
    expect(userFacingFieldLabel("Prazo para revisão do contrato")).toBe("Prazo para revisão do contrato");
  });

  it("humaniza o código quando o banco não fornece um rótulo", () => {
    expect(userFacingFieldLabel("cp_nome_focal", "cp_nome_focal")).toBe("Nome focal");
  });

  it("corrige eventos históricos sem alterar o registro no banco", () => {
    expect(
      userFacingActivityTitle({
        kind: "campo_pipeline_alterado",
        title: "Campo atualizado: Escopo detalhado por área (JSON) [CP]",
        metadata: { field_code: "cp_escopo_detalhe_json" },
      }),
    ).toBe("Campo atualizado: Escopo detalhado por área");

    expect(
      userFacingActivityTitle({
        kind: "campo_rd_alterado",
        title: "Campo RD atualizado: Razão Social [CP]",
        metadata: { field_key: "razao_social" },
      }),
    ).toBe("Campo RD atualizado: Razão Social");
  });
});
