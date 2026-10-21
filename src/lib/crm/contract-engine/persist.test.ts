import { describe, expect, it } from "vitest";
import { manualSelectedClauses } from "./persist";

describe("manualSelectedClauses", () => {
  it("mantém só as cláusulas escolhidas na barra lateral, sem o retrato do motor", () => {
    const manual = { id: "lib-1", title: "Utilização de Marca", content: "texto", order: 0 };
    const doMotor = {
      id: "fees-0",
      title: "Honorários Contratuais",
      content: "Honorários fixos de R$ 36.000,00",
      order: 1,
      origin: "payment_engine",
      sourceLabel: "Proposta",
    };
    expect(manualSelectedClauses({ clausulas_selecionadas: [doMotor, manual] })).toEqual([manual]);
  });

  it("sem lista gravada devolve vazio", () => {
    expect(manualSelectedClauses({})).toEqual([]);
    expect(manualSelectedClauses({ clausulas_selecionadas: "x" })).toEqual([]);
  });
});
