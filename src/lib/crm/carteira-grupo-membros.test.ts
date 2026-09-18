import { describe, expect, it } from "vitest";
import {
  classifyCarteiraGrupoMembro,
  formatCarteiraDocumento,
  splitCarteiraGrupoMembros,
} from "./carteira-grupo-membros";

describe("classifyCarteiraGrupoMembro", () => {
  it("CPF (11 dígitos) vai para Pessoas e CNPJ (14) para Empresas, mesmo com tipo/id errados", () => {
    expect(
      classifyCarteiraGrupoMembro({
        documento: "296.469.968-25",
        tipo: "PESSOA JURÍDICA",
        orqestraiCompanyId: "co-errado",
      }),
    ).toBe("pessoa");
    expect(classifyCarteiraGrupoMembro({ documento: "29646996825" })).toBe("pessoa");
    expect(
      classifyCarteiraGrupoMembro({
        documento: "36.704.785/0001-20",
        tipo: "PESSOA FÍSICA",
        orqestraiPersonId: "pe-errado",
      }),
    ).toBe("empresa");
    expect(
      classifyCarteiraGrupoMembro({ tipo: "PESSOA JURÍDICA", documento: "36704785000120" }),
    ).toBe("empresa");
  });

  it("sem documento usa o id/tipo só como fallback e não força empresa", () => {
    expect(classifyCarteiraGrupoMembro({ orqestraiPersonId: "pe-1" })).toBe("pessoa");
    expect(classifyCarteiraGrupoMembro({ orqestraiCompanyId: "co-1" })).toBe("empresa");
    expect(classifyCarteiraGrupoMembro({ tipo: "PESSOA FÍSICA" })).toBe("pessoa");
    expect(classifyCarteiraGrupoMembro({})).toBe("pessoa");
  });
});

describe("formatCarteiraDocumento", () => {
  it("mascara CNPJ e CPF", () => {
    expect(formatCarteiraDocumento("36704785000120")).toBe("36.704.785/0001-20");
    expect(formatCarteiraDocumento("12345678901")).toBe("123.456.789-01");
    expect(formatCarteiraDocumento(null)).toBe("—");
  });
});

describe("splitCarteiraGrupoMembros", () => {
  it("lista empresas e pessoas do 3TM em ordem alfabética", () => {
    const { empresas, pessoas } = splitCarteiraGrupoMembros([
      {
        id: "p2",
        nome: "Tricia Amurov Peres Mantovani",
        documento: "296.469.968-25",
        email: null,
        telefone: null,
        kind: "empresa",
      },
      {
        id: "e2",
        nome: "Aurapack",
        documento: "36704785000120",
        email: null,
        telefone: null,
        kind: "pessoa",
      },
      {
        id: "e1",
        nome: "3Tm Distribuidora",
        documento: "48.978.532/0001-24",
        email: null,
        telefone: null,
        kind: "empresa",
      },
      {
        id: "p1",
        nome: "João Paulo Caldas",
        documento: "12345678901",
        email: null,
        telefone: null,
        kind: "pessoa",
      },
    ]);
    expect(empresas.map((row) => row.nome)).toEqual(["3Tm Distribuidora", "Aurapack"]);
    expect(pessoas.map((row) => row.nome)).toEqual([
      "João Paulo Caldas",
      "Tricia Amurov Peres Mantovani",
    ]);
  });

  it("grupo só com CPF fica em Pessoas e não some a seção", () => {
    const { empresas, pessoas } = splitCarteiraGrupoMembros([
      {
        id: "pf-1",
        nome: "Pessoa Só",
        documento: "296.469.968-25",
        email: null,
        telefone: null,
        kind: "empresa",
      },
    ]);
    expect(empresas).toEqual([]);
    expect(pessoas.map((row) => row.nome)).toEqual(["Pessoa Só"]);
  });
});
