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
