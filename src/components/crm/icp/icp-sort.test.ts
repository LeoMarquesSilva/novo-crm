import { describe, expect, it } from "vitest";
import { nextSort, sortRows } from "@/components/crm/icp/icp-sort";

describe("nextSort", () => {
  it("primeiro clique numa coluna ordena do menor para o maior; o segundo inverte", () => {
    const first = nextSort({ key: "receita", desc: true }, "horas");
    expect(first).toEqual({ key: "horas", desc: false });
    expect(nextSort(first, "horas")).toEqual({ key: "horas", desc: true });
  });
});

describe("sortRows", () => {
  const rows = [
    { nome: "Beta", valor: 20 },
    { nome: "alfa", valor: null },
    { nome: "Gama", valor: 5 },
  ];

  it("ordena números nos dois sentidos e deixa quem não tem valor no fim", () => {
    const asc = sortRows(rows, { key: "valor", desc: false }, (r) => r.valor);
    expect(asc.map((r) => r.nome)).toEqual(["Gama", "Beta", "alfa"]);
    const desc = sortRows(rows, { key: "valor", desc: true }, (r) => r.valor);
    expect(desc.map((r) => r.nome)).toEqual(["Beta", "Gama", "alfa"]);
  });

  it("ordena texto em ordem alfabética do português, sem mudar a lista original", () => {
    const byName = sortRows(rows, { key: "nome", desc: false }, (r) => r.nome.toLowerCase());
    expect(byName.map((r) => r.nome)).toEqual(["alfa", "Beta", "Gama"]);
    expect(rows[0].nome).toBe("Beta");
  });
});
