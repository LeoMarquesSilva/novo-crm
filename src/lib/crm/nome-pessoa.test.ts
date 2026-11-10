import { describe, expect, it } from "vitest";
import { isEmailValido, isTelefoneBrValido, maskNomePessoa } from "./nome-pessoa";

describe("maskNomePessoa", () => {
  it("põe a primeira letra de cada nome em maiúscula", () => {
    expect(maskNomePessoa("LUCAS DOURADO")).toBe("Lucas Dourado");
    expect(maskNomePessoa("maria souza lima")).toBe("Maria Souza Lima");
  });

  it("deixa as partículas minúsculas, menos no começo", () => {
    expect(maskNomePessoa("maria DA silva DOS santos")).toBe("Maria da Silva dos Santos");
    expect(maskNomePessoa("de paula")).toBe("De Paula");
  });

  it("trata hífen, apóstrofo e acentos", () => {
    expect(maskNomePessoa("ana-maria d'ávila")).toBe("Ana-Maria D'Ávila");
    expect(maskNomePessoa("ÉRICA ÂNGELA")).toBe("Érica Ângela");
  });

  it("mantém os espaços de quem ainda está digitando", () => {
    expect(maskNomePessoa("lucas ")).toBe("Lucas ");
    expect(maskNomePessoa("")).toBe("");
  });
});

describe("contato do decisor", () => {
  it("aceita telefone com DDD, fixo ou celular", () => {
    expect(isTelefoneBrValido("(19) 3333-4444")).toBe(true);
    expect(isTelefoneBrValido("(19) 98888-7777")).toBe(true);
    expect(isTelefoneBrValido("+55 19 98888-7777")).toBe(true);
    expect(isTelefoneBrValido("98888-7777")).toBe(false);
  });

  it("confere o formato do e-mail", () => {
    expect(isEmailValido("joao@empresa.com.br")).toBe(true);
    expect(isEmailValido("joao@empresa")).toBe(false);
    expect(isEmailValido("joao empresa.com")).toBe(false);
  });
});
