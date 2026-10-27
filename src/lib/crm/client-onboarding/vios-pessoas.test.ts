import { describe, expect, it } from "vitest";

import { emptyClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

import { compareCadastroWithVios, type ViosPessoa } from "./vios-pessoas";

const pessoa = (patch: Partial<ViosPessoa>): ViosPessoa => ({
  id: "p-1",
  ci: "50315",
  nome: "Inovageo Geossinteticos Ltda",
  cpfCnpj: "44.173.316/0001-50",
  tipo: "PESSOA JURÍDICA",
  logradouro: "AVENIDA JOSE TREVISAN SERTAOZINHO",
  numero: "50",
  complemento: null,
  bairro: "JARDIM ABAETE",
  cidade: "Piracicaba",
  uf: "SP",
  cep: "13420-267",
  email: null,
  telefone: "5519992200004",
  categoria: "Cliente ativo",
  ...patch,
});

function cadastro() {
  const c = emptyClientOnboardingPayload().cadastro;
  c.razaoSocial = "INOVAGEO GEOSSINTÉTICOS LTDA";
  c.documento = "44173316000150";
  c.endereco = {
    cep: "13420204",
    logradouro: "Av. José Trevisan Sertãozinho",
    numero: "50",
    complemento: "",
    bairro: "Jardim Abaeté",
    cidade: "Piracicaba",
    uf: "SP",
  };
  c.telefone = "(19) 99220-0004";
  return c;
}

describe("conferência do cadastro com o VIOS", () => {
  it("acha a pessoa pelo CPF/CNPJ, traz o código do VIOS e aponta só o que diverge", () => {
    const r = compareCadastroWithVios(cadastro(), [pessoa({ id: "outra", cpfCnpj: "44.173.316/0002-31" }), pessoa({})]);
    expect(r.pessoaId).toBe("p-1");
    expect(r.ci).toBe("50315");
    // Acento, caixa, "Av." e o 55 do telefone não contam como divergência; o CEP diferente conta.
    expect(r.itens.filter((i) => !i.ok).map((i) => i.label)).toEqual(["CEP"]);
    // E-mail vazio no CRM (opcional) não é divergência.
    expect(r.itens.find((i) => i.label === "E-mail")?.ok).toBe(true);
  });

  it("sem a pessoa no grupo, nada confere", () => {
    const r = compareCadastroWithVios(cadastro(), [pessoa({ cpfCnpj: "11.222.333/0001-81" })]);
    expect(r.pessoaId).toBeNull();
    expect(r.ci).toBeNull();
    expect(r.itens.every((i) => !i.ok)).toBe(true);
  });
});
