import { describe, expect, it } from "vitest";
import {
  CARTEIRA_GRUPOS_DEFAULT_SORT,
  sortCarteiraGrupos,
  toggleCarteiraGruposSort,
} from "./carteira-clientes-sort";

const rows = [
  { nome: "Zeta", clienteStatus: "ativo" as const },
  { nome: "Alfa", clienteStatus: "inativo" as const },
  { nome: "Alfa", clienteStatus: "ativo" as const },
  { nome: "Beta", clienteStatus: null },
  { nome: "Gama", clienteStatus: "inativo" as const },
];

describe("sortCarteiraGrupos", () => {
  it("ordena por nome A–Z e, no empate, Cliente ativo antes de inativo; sem informação por último", () => {
    expect(sortCarteiraGrupos(rows).map((row) => `${row.nome}:${row.clienteStatus}`)).toEqual([
      "Alfa:ativo",
      "Alfa:inativo",
      "Beta:null",
      "Gama:inativo",
      "Zeta:ativo",
    ]);
  });

  it("ao ordenar por Status, ativo vem antes de inativo e nulo permanece no fim", () => {
    expect(
      sortCarteiraGrupos(rows, { key: "status", direction: "asc" }).map(
        (row) => `${row.nome}:${row.clienteStatus}`,
      ),
    ).toEqual(["Alfa:ativo", "Zeta:ativo", "Alfa:inativo", "Gama:inativo", "Beta:null"]);

    expect(
      sortCarteiraGrupos(rows, { key: "status", direction: "desc" }).map(
        (row) => `${row.nome}:${row.clienteStatus}`,
      ),
    ).toEqual(["Alfa:inativo", "Gama:inativo", "Alfa:ativo", "Zeta:ativo", "Beta:null"]);
  });
});

describe("toggleCarteiraGruposSort", () => {
  it("começa em nome asc e alterna a coluna clicada", () => {
    expect(CARTEIRA_GRUPOS_DEFAULT_SORT).toEqual({ key: "nome", direction: "asc" });
    expect(toggleCarteiraGruposSort(CARTEIRA_GRUPOS_DEFAULT_SORT, "nome")).toEqual({
      key: "nome",
      direction: "desc",
    });
    expect(toggleCarteiraGruposSort(CARTEIRA_GRUPOS_DEFAULT_SORT, "status")).toEqual({
      key: "status",
      direction: "asc",
    });
  });
});
