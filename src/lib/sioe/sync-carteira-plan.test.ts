import { describe, expect, it } from "vitest";
import { planCarteiraGrupoWrites } from "./sync-carteira-plan";

describe("planCarteiraGrupoWrites", () => {
  it("preserva o UUID local quando a chave já existe sem orqestrai_id", () => {
    const planned = planCarteiraGrupoWrites(
      [{
        id: "orq-le-blog",
        chave_estavel: "grupo le blog",
        orqestrai_id: "orq-le-blog",
        nome: "Grupo Le Blog",
      }],
      [{
        id: "crm-local",
        chave_estavel: "grupo le blog",
        orqestrai_id: null,
      }],
    );

    expect(planned.inserts).toEqual([]);
    expect(planned.updates).toEqual([{
      id: "crm-local",
      chave_estavel: "grupo le blog",
      orqestrai_id: "orq-le-blog",
      nome: "Grupo Le Blog",
    }]);
  });

  it("insere grupo novo com o id do OrquestrAI", () => {
    const planned = planCarteiraGrupoWrites(
      [{
        id: "orq-novo",
        chave_estavel: "grupo novo",
        orqestrai_id: "orq-novo",
        nome: "Grupo Novo",
      }],
      [],
    );

    expect(planned.updates).toEqual([]);
    expect(planned.inserts[0]?.id).toBe("orq-novo");
  });

  it("casa primeiro por orqestrai_id mesmo se a chave mudou", () => {
    const planned = planCarteiraGrupoWrites(
      [{
        id: "orq-1",
        chave_estavel: "grupo novo nome",
        orqestrai_id: "orq-1",
        nome: "Grupo Novo Nome",
      }],
      [{
        id: "crm-local",
        chave_estavel: "grupo nome antigo",
        orqestrai_id: "orq-1",
      }],
    );

    expect(planned.inserts).toEqual([]);
    expect(planned.updates[0]?.id).toBe("crm-local");
    expect(planned.updates[0]?.chave_estavel).toBe("grupo novo nome");
  });
});
