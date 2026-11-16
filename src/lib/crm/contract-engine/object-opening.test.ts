import { describe, expect, it } from "vitest";
import { semAberturaDoObjeto } from "./object-opening";

describe("semAberturaDoObjeto", () => {
  it("tira as aberturas do catálogo e começa pelo objeto", () => {
    expect(semAberturaDoObjeto("O presente Contrato tem por objeto a prestação de serviços na área Cível.")).toBe(
      "A prestação de serviços na área Cível.",
    );
    expect(semAberturaDoObjeto("O Contrato tem por objeto a prestação de serviços especializados.")).toBe(
      "A prestação de serviços especializados.",
    );
    expect(semAberturaDoObjeto("O objeto do presente Contrato é a prestação de serviços na área trabalhista.")).toBe(
      "A prestação de serviços na área trabalhista.",
    );
    expect(semAberturaDoObjeto("O objeto deste Contrato é a prestação mensal de serviços.")).toBe(
      "A prestação mensal de serviços.",
    );
    expect(semAberturaDoObjeto("O objeto do presente Contrato consiste na disponibilização de plataforma.")).toBe(
      "A disponibilização de plataforma.",
    );
    expect(semAberturaDoObjeto("O objeto do presente Contrato inclui atuação consultiva trabalhista.")).toBe(
      "Atuação consultiva trabalhista.",
    );
  });

  it("texto sem abertura conhecida volta igual", () => {
    expect(semAberturaDoObjeto("Consultoria jurídica mensal com limitação de horas.")).toBe(
      "Consultoria jurídica mensal com limitação de horas.",
    );
    expect(semAberturaDoObjeto("O presente Contrato possui natureza de prestação de serviços.")).toBe(
      "O presente Contrato possui natureza de prestação de serviços.",
    );
  });
});
