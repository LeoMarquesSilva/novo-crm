import { describe, expect, it } from "vitest";

import { describeTermRule } from "./term";

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
