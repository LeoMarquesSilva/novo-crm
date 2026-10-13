import { describe, expect, it } from "vitest";

import { comparePlans, planLabel, planShortLabel } from "@/modules/icp/domain/plano-contas";

describe("planLabel", () => {
  it("mantém o nome do plano igual ao do SIOE", () => {
    for (const plano of [
      "HONORÁRIOS MENSAIS",
      "HONORÁRIOS ADVOCATÍCIOS",
      "HONORÁRIOS SPOT",
      "HONORÁRIOS DE ÊXITO",
      "HONORÁRIOS DE SUCUMBÊNCIA",
      "HONORÁRIOS DE MANUTENÇÃO",
      "HONORÁRIOS POR HORA TRABALHADA",
    ]) {
      expect(planLabel(plano)).toBe(plano);
    }
  });

  it("junta as variações sem acento ou com acentuação quebrada do VIOS", () => {
    expect(planLabel("Honorarios mensais")).toBe("HONORÁRIOS MENSAIS");
    expect(planLabel("HONOR�RIOS DE MANUTEN��O")).toBe("HONORÁRIOS DE MANUTENÇÃO");
  });

  it("plano fora da lista mantém o texto", () => {
    expect(planLabel("Honorários de parecer")).toBe("HONORÁRIOS DE PARECER");
    expect(planLabel(null)).toBe("SEM PLANO DE CONTAS");
  });
});

describe("comparePlans e planShortLabel", () => {
  it("ordena pela lista do SIOE e deixa os demais no fim", () => {
    expect(
      ["HONORÁRIOS SPOT", "HONORÁRIOS DE PARECER", "HONORÁRIOS MENSAIS", "HONORÁRIOS ADVOCATÍCIOS"].sort(comparePlans),
    ).toEqual(["HONORÁRIOS MENSAIS", "HONORÁRIOS ADVOCATÍCIOS", "HONORÁRIOS SPOT", "HONORÁRIOS DE PARECER"]);
  });

  it("encurta o nome para frases", () => {
    expect(planShortLabel("HONORÁRIOS DE ÊXITO")).toBe("de êxito");
    expect(planShortLabel("HONORÁRIOS MENSAIS")).toBe("mensais");
  });
});
