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

describe("mergeEscopoTemplate valores monetários", () => {
  it.each([
    ["Valor da Hora Adicional", "R$ [Valor da Hora Adicional] por hora"],
    ["VALORHORAEXCEDENTE", "R$ [VALORHORAEXCEDENTE] por hora"],
    ["Vlr adcional de processo", "R$ [Vlr adcional de processo] por processo"],
  ])("formata %s com valor numérico e por extenso sem duplicar R$", (key, template) => {
    const out = mergeEscopoTemplate(template, { [key]: "R$ 1.250,50" }, {});
    expect(out).toBe(
      "R$ 1.250,50 (mil e duzentos e cinquenta reais e cinquenta centavos) " +
        (template.endsWith("por hora") ? "por hora" : "por processo"),
    );
  });

  it("inclui R$ quando o template não traz o símbolo antes do valor", () => {
    const out = mergeEscopoTemplate(
      "O valor da causa é [VALOR_CAUSA].",
      { VALOR_CAUSA: "1000" },
      {},
    );
    expect(out).toBe("O valor da causa é R$ 1.000,00 (mil reais).");
  });
});
