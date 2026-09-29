import { describe, expect, it } from "vitest";
import {
  buildClienteLookupResult,
  findClienteByDocumentDigits,
  filterContratosParaAditivo,
} from "./lookup-cliente-by-document";

const clientes = [
  {
    id: "c1",
    razao_social: "Matriz LTDA",
    documento: "12.345.678/0001-90",
    logradouro: "Rua A",
    numero: "10",
    complemento: null,
    bairro: "Centro",
    cidade: "Campinas",
    uf: "SP",
    cep: "13000-000",
    email_principal: null,
    telefone_principal: null,
  },
  {
    id: "c2",
    razao_social: "Filial LTDA",
    documento: "12.345.678/0002-71",
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    email_principal: null,
    telefone_principal: null,
  },
];

describe("findClienteByDocumentDigits", () => {
  it("matches exact document", () => {
    const match = findClienteByDocumentDigits(clientes, "12345678000190");
    expect(match?.cliente.id).toBe("c1");
    expect(match?.matchedBy).toBe("documento");
  });

  it("falls back to CNPJ root", () => {
    const match = findClienteByDocumentDigits(clientes, "12.345.678/9999-99");
    expect(match?.cliente.id).toBe("c1");
    expect(match?.matchedBy).toBe("cnpj_raiz");
  });
});

describe("buildClienteLookupResult", () => {
  it("returns contracts excluding encerrados", () => {
    const map = new Map([
      [
        "c1",
        [
          { id: "t1", titulo: "Ativo", status: "ativo", vigente_de: "2024-01-01" },
          { id: "t2", titulo: "Fim", status: "encerrado", vigente_de: null },
        ],
      ],
    ]);
    const result = buildClienteLookupResult({
      clientes,
      documento: "12345678000190",
      contratosByClienteId: map,
    });
    expect(result.found).toBe(true);
    expect(result.contratos).toHaveLength(1);
    expect(result.contratos[0]?.id).toBe("t1");
  });
});

describe("filterContratosParaAditivo", () => {
  it("drops encerrado", () => {
    expect(
      filterContratosParaAditivo([
        { id: "1", titulo: "A", status: "encerrado", vigente_de: null },
        { id: "2", titulo: "B", status: "ativo", vigente_de: null },
      ]),
    ).toHaveLength(1);
  });
});
