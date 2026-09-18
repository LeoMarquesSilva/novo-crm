import { describe, expect, it } from "vitest";
import {
  buildClienteAtividadeIndex,
  carteiraClienteStatus,
  lookupClienteAtividade,
} from "./gestor-atividade";

describe("carteiraClienteStatus", () => {
  it("trata gestor_atividade do OrquestrAI como Cliente ativo ou inativo", () => {
    expect(carteiraClienteStatus("ativo")).toBe("ativo");
    expect(carteiraClienteStatus("Ativo")).toBe("ativo");
    expect(carteiraClienteStatus("inativo")).toBe("inativo");
    expect(carteiraClienteStatus("Inativo")).toBe("inativo");
    expect(carteiraClienteStatus(null)).toBe("inativo");
  });
});

describe("lookupClienteAtividade", () => {
  const index = buildClienteAtividadeIndex([
    { id: "g-ativo", name: "Grupo Pague Menos", gestorAtividade: "ativo" },
    { id: "g-inativo", name: "Grupo Eleva", nameNormalized: "grupo eleva", gestorAtividade: "inativo" },
  ]);

  it("casa pelo id do OrquestrAI e, se faltar, pela chave do nome", () => {
    expect(lookupClienteAtividade(index, { orqestraiId: "g-ativo" })).toBe("ativo");
    expect(lookupClienteAtividade(index, { groupKey: "grupo eleva" })).toBe("inativo");
    expect(lookupClienteAtividade(index, { orqestraiId: "missing", groupKey: "grupo pague menos" })).toBe(
      "ativo",
    );
  });
});
