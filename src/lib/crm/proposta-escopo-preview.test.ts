import { describe, expect, it } from "vitest";
import { formatHorasMesForMerge, mergeEscopoTemplate } from "./proposta-escopo-preview";

describe("formatHorasMesForMerge", () => {
  it("formata número como horas por mês", () => {
    expect(formatHorasMesForMerge("12")).toBe("12 horas por mês.");
    expect(formatHorasMesForMerge("1")).toBe("1 hora por mês.");
  });

  it("mantém texto já redigido", () => {
    expect(formatHorasMesForMerge("12 horas por mês")).toBe("12 horas por mês.");
  });
});

describe("mergeEscopoTemplate HORAS MES", () => {
  it("substitui [HORAS MES] no template", () => {
    const out = mergeEscopoTemplate("Pacote de [HORAS MES] consultivo.", { "HORAS MES": "12" }, {});
    expect(out).toBe("Pacote de 12 horas por mês. consultivo.");
  });
});
