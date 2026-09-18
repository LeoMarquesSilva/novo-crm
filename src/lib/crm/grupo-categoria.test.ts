import { describe, expect, it } from "vitest";
import {
  buildClienteResponsibleAreaIndex,
  lookupClienteResponsibleArea,
  origemLinhaForGrupoEconomico,
  origemLinhaForOportunidade,
  origemLinhaFromGrupoCategoria,
  parseCarteiraOrigemLinha,
  persistCarteiraCategoria,
  legacyCategoriaAsResponsibleArea,
} from "./grupo-categoria";

describe("carteira origem_linha (Categoria)", () => {
  it("grupos econômicos da carteira são Cliente, oportunidades são Lead", () => {
    expect(origemLinhaForGrupoEconomico()).toBe("cliente");
    expect(origemLinhaForOportunidade()).toBe("lead");
    expect(persistCarteiraCategoria("cliente")).toBe("Cliente");
    expect(persistCarteiraCategoria("lead")).toBe("Lead");
  });

  it("lê Cliente/Lead e ignora texto legado de área jurídica", () => {
    expect(parseCarteiraOrigemLinha("Cliente")).toBe("cliente");
    expect(parseCarteiraOrigemLinha("LEAD")).toBe("lead");
    expect(parseCarteiraOrigemLinha("Cível")).toBeNull();
    expect(parseCarteiraOrigemLinha("Societário e Contratos")).toBeNull();
    expect(origemLinhaFromGrupoCategoria("Cível")).toBe("cliente");
    expect(origemLinhaFromGrupoCategoria("Lead")).toBe("lead");
    expect(origemLinhaFromGrupoCategoria(null)).toBe("cliente");
  });

  it("só reaproveita categoria legado como área quando não for Cliente/Lead", () => {
    expect(legacyCategoriaAsResponsibleArea("Cível")).toBe("Cível");
    expect(legacyCategoriaAsResponsibleArea("Cliente")).toBeNull();
    expect(legacyCategoriaAsResponsibleArea("Lead")).toBeNull();
    expect(legacyCategoriaAsResponsibleArea(null)).toBeNull();
  });
});

describe("lookupClienteResponsibleArea", () => {
  const index = buildClienteResponsibleAreaIndex([
    {
      id: "c0167528-b684-46f5-8ef9-64b219968e3f",
      name: "3TM",
      responsibleArea: "Societário e Contratos",
    },
    { id: "g-civel", name: "Grupo Alfa", nameNormalized: "grupo alfa", responsibleArea: "Cível" },
  ]);

  it("casa responsible_area pelo id do OrquestrAI e, se faltar, pela chave do nome", () => {
    expect(
      lookupClienteResponsibleArea(index, { orqestraiId: "c0167528-b684-46f5-8ef9-64b219968e3f" }),
    ).toBe("Societário e Contratos");
    expect(lookupClienteResponsibleArea(index, { groupKey: "grupo alfa" })).toBe("Cível");
    expect(
      lookupClienteResponsibleArea(index, { orqestraiId: "missing", groupKey: "3tm" }),
    ).toBe("Societário e Contratos");
  });
});
