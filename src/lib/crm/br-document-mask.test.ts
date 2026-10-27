import { describe, expect, it } from "vitest";

import { maskCpfCnpj, maskForFieldCode, maskPhoneBr } from "./br-document-mask";

describe("máscaras de documento e telefone (teste ponta a ponta 4)", () => {
  it("CPF ou CNPJ pelo número de dígitos", () => {
    expect(maskCpfCnpj("12345678909")).toBe("123.456.789-09");
    expect(maskCpfCnpj("48030003000102")).toBe("48.030.003/0001-02");
    expect(maskCpfCnpj("4803000300010299")).toBe("48.030.003/0001-02");
  });

  it("telefone fixo, celular e com +55", () => {
    expect(maskPhoneBr("3533334444")).toBe("(35) 3333-4444");
    expect(maskPhoneBr("35988754584")).toBe("(35) 98875-4584");
    expect(maskPhoneBr("+55 35 98875-4584")).toBe("(35) 98875-4584");
    expect(maskPhoneBr("359")).toBe("(35) 9");
    expect(maskPhoneBr("")).toBe("");
  });

  it("máscara pelo código só para campo de documento", () => {
    expect(maskForFieldCode("cnpj_cpf_financeiro")?.("12345678909")).toBe("123.456.789-09");
    expect(maskForFieldCode("cp_cliente_cep")).toBeNull();
    expect(maskForFieldCode("cp_nome_focal")).toBeNull();
  });
});
