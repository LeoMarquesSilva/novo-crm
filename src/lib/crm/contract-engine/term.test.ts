import { describe, expect, it } from "vitest";

import { CONTRACT_SCOPE_PROFILES } from "./scope-profiles";
import { describeTermRule, mergeTermRules, renderTermText } from "./term";

describe("mergeTermRules", () => {
  const auditoria = {
    kind: "until_deliverable_with_estimate" as const,
    deliverable: "Relatório Conclusivo da Auditoria Trabalhista",
    months: 4,
    estimateLabel: "4 (quatro) meses",
  };

  it("prazos diferentes viram a vigência de cada escopo, sem nota interna (teste de 16/11/2026)", () => {
    const term = mergeTermRules(
      [{ kind: "fixed_months", months: 12 }, auditoria],
      ["Contencioso Cível (1 processo)", "Auditoria Trabalhista"],
    );
    const texto = renderTermText(term);
    expect(texto).not.toMatch(/REQUIRES|LEGAL DECISION/i);
    expect(texto).toBe(
      "A vigência do presente Contrato observa o prazo de cada escopo contratado: (i) Contencioso Cível (1 processo): 12 (doze) meses, contados da data de assinatura do Contrato; (ii) Auditoria Trabalhista: até a entrega, pela Contratada, do Relatório Conclusivo da Auditoria Trabalhista, com prazo estimado de 4 (quatro) meses.",
    );
    expect(describeTermRule(term)).toBe(texto);
  });

  it("escopos com o mesmo prazo ficam juntos; prazo único volta como está", () => {
    const doze = { kind: "fixed_months" as const, months: 12 };
    expect(mergeTermRules([doze, { ...doze }], ["A", "B"])).toEqual(doze);
    const texto = renderTermText(mergeTermRules([doze, auditoria, { ...doze }], ["Cível", "Auditoria", "Tributário"]));
    expect(texto).toContain("(i) Cível e Tributário: 12 (doze) meses");
    expect(texto).toContain("(ii) Auditoria: até a entrega");
  });

  it("mesmo tipo com prazos diferentes também mostra os dois (antes ficava só o primeiro)", () => {
    const texto = renderTermText(
      mergeTermRules([{ kind: "fixed_months", months: 12 }, { kind: "fixed_months", months: 6 }], ["X", "Y"]),
    );
    expect(texto).toContain("(i) X: 12 (doze) meses");
    expect(texto).toContain("(ii) Y: 6 (seis) meses");
  });
});

describe("describeTermRule", () => {
  it("não mostra o código interno da vigência", () => {
    expect(describeTermRule({ kind: "until_deliverable", deliverable: "relatório diagnóstico societário" })).toBe(
      "Até a entrega: relatório diagnóstico societário",
    );
    expect(
      describeTermRule({
        kind: "until_deliverable_with_estimate",
        deliverable: "Relatório Conclusivo",
        months: 4,
        estimateLabel: "4 (quatro) meses",
      }),
    ).toBe("Até a entrega: Relatório Conclusivo (estimativa: 4 (quatro) meses)");
    expect(describeTermRule({ kind: "fixed_months", months: 12 })).toBe("12 meses");
    expect(describeTermRule({ kind: "fixed_days", days: 1 })).toBe("1 dia");
    expect(describeTermRule({ kind: "indefinite" })).toBe("Prazo indeterminado");
    expect(describeTermRule({ kind: "manual" })).toBe("Definida nas condições contratuais");
  });
});

describe("vigência padrão (03/11/2026)", () => {
  it("contrato recorrente sai com 12 meses contados da assinatura", () => {
    expect(CONTRACT_SCOPE_PROFILES.some((profile) => profile.defaultTermRule.kind === "indefinite")).toBe(false);
    expect(renderTermText({ kind: "fixed_months", months: 12 })).toBe(
      "O presente Contrato terá vigência de 12 (doze) meses, contados da data de sua assinatura, podendo ser renovado mediante aditivo contratual.",
    );
  });
});
