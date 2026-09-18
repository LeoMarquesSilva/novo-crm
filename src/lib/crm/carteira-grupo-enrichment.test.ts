import { describe, expect, it } from "vitest";
import {
  buildOrqestraiGroupLookup,
  enrichCarteiraGrupoOrqestrai,
  persistGestorAtividade,
} from "./carteira-grupo-enrichment";
import type { OrqestraiClientGroup } from "@/lib/orqestrai/client-groups";

const live: OrqestraiClientGroup = {
  id: "c0167528-b684-46f5-8ef9-64b219968e3f",
  name: "Grupo 3TM",
  nameNormalized: "grupo 3tm",
  gestorAtividade: "ativo",
  responsibleArea: "Cível",
  legalAreas: ["Cível", "Reestruturação"],
};

describe("enrichCarteiraGrupoOrqestrai", () => {
  it("usa o fetch ao vivo quando o OrquestrAI responde", () => {
    const lookup = buildOrqestraiGroupLookup([live]);
    expect(
      enrichCarteiraGrupoOrqestrai(
        {
          orqestrai_id: live.id,
          chave_estavel: "grupo 3tm",
          gestor_atividade: "inativo",
          responsible_area: "Trabalhista",
          legal_areas: ["Trabalhista"],
          categoria: "Cliente",
        },
        lookup,
      ),
    ).toEqual({
      clienteStatus: "ativo",
      responsibleArea: "Cível",
      legalAreas: ["Cível", "Reestruturação"],
    });
  });

  it("cai no espelho local quando o fetch ao vivo falha", () => {
    const lookup = buildOrqestraiGroupLookup([]);
    expect(
      enrichCarteiraGrupoOrqestrai(
        {
          orqestrai_id: live.id,
          chave_estavel: "grupo 3tm",
          gestor_atividade: "ativo",
          responsible_area: "Cível",
          legal_areas: ["Cível", "Reestruturação"],
          categoria: "Cliente",
        },
        lookup,
      ),
    ).toEqual({
      clienteStatus: "ativo",
      responsibleArea: "Cível",
      legalAreas: ["Cível", "Reestruturação"],
    });
  });

  it("não inventa status quando não há espelho nem fetch", () => {
    expect(
      enrichCarteiraGrupoOrqestrai(
        {
          orqestrai_id: live.id,
          chave_estavel: "grupo 3tm",
          categoria: "Cliente",
        },
        buildOrqestraiGroupLookup(null),
      ),
    ).toEqual({
      clienteStatus: null,
      responsibleArea: null,
      legalAreas: [],
    });
  });
});

describe("persistGestorAtividade", () => {
  it("só grava ativo ou inativo", () => {
    expect(persistGestorAtividade("ativo")).toBe("ativo");
    expect(persistGestorAtividade("inativo")).toBe("inativo");
    expect(persistGestorAtividade(null)).toBeNull();
    expect(persistGestorAtividade("pendente")).toBeNull();
  });
});
