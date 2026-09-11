import { describe, expect, it } from "vitest";
import { buildPropostaPreviewPage, type CanonicalProposalData } from "./proposta-docx-data";

function canonical(overrides: Partial<CanonicalProposalData> = {}): CanonicalProposalData {
  return {
    templateData: {
      EMPRESA: "ACME Ltda",
      RESPONSAVEL: "Fulano de Tal",
      DATA_PROPOSTA: "16 de abril de 2026",
      DATA_VIGENCIA: "23 de abril de 2026",
      INVESTIMENTO: "Investimento\n\npagamento mensal de R$ 1.000,00",
    },
    escopoSections: [],
    generatedAt: "2026-04-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildPropostaPreviewPage", () => {
  it("mapeia capa, escopo/investimento e fechamento a partir do templateData/escopoSections", () => {
    const areas = [
      { areaLabel: "Cível", scopeTypeLabel: "Contencioso", label: "Cível — Contencioso", text: "Texto do escopo cível." },
    ];
    const page = buildPropostaPreviewPage(canonical({ escopoSections: areas }));
    expect(page).toEqual({
      capa: { empresa: "ACME Ltda", responsavel: "Fulano de Tal", dataProposta: "16 de abril de 2026" },
      escopoInvestimento: { areas, investimentoText: "Investimento\n\npagamento mensal de R$ 1.000,00" },
      fechamento: { dataVigencia: "23 de abril de 2026" },
    });
  });

  it("escopo vazio vira lista de áreas vazia, sem quebrar", () => {
    const page = buildPropostaPreviewPage(canonical({ escopoSections: [] }));
    expect(page.escopoInvestimento.areas).toEqual([]);
  });

  it("múltiplas áreas preservam a ordem original de escopoSections", () => {
    const areas = [
      { areaLabel: "Cível", scopeTypeLabel: "Contencioso", label: "Cível — Contencioso", text: "Escopo cível." },
      { areaLabel: "Trabalhista", scopeTypeLabel: "Auditoria", label: "Trabalhista — Auditoria", text: "Escopo trabalhista." },
    ];
    const page = buildPropostaPreviewPage(canonical({ escopoSections: areas }));
    expect(page.escopoInvestimento.areas.map((a) => a.areaLabel)).toEqual(["Cível", "Trabalhista"]);
  });

  it("DATA_VIGENCIA ausente vira string vazia, não undefined", () => {
    const page = buildPropostaPreviewPage(
      canonical({ templateData: { EMPRESA: "ACME Ltda", RESPONSAVEL: "Fulano", DATA_PROPOSTA: "16/04/2026" } }),
    );
    expect(page.fechamento.dataVigencia).toBe("");
  });
});
