import { describe, expect, it } from "vitest";

import { matchesDueDiligenceTextQuery } from "./due-diligence-filters";

const lead = {
  leadName: "Empresa Exemplo",
  solicitanteNome: "Maria Silva",
  oportunidadeId: "lead-123",
  documents: [{ originalFilename: "Compilação Tributária.pptx" }],
};

describe("matchesDueDiligenceTextQuery", () => {
  it("pesquisa por negociação e solicitante", () => {
    expect(matchesDueDiligenceTextQuery(lead, "empresa")).toBe(true);
    expect(matchesDueDiligenceTextQuery(lead, "maria")).toBe(true);
  });

  it("pesquisa também pelo nome do arquivo", () => {
    expect(matchesDueDiligenceTextQuery(lead, "tributária")).toBe(true);
  });

  it("rejeita termos ausentes", () => {
    expect(matchesDueDiligenceTextQuery(lead, "contrato")).toBe(false);
  });
});
