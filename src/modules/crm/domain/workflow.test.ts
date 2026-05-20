import { describe, expect, it } from "vitest";
import { canMoveToStage, getAllowedJourney } from "@/modules/crm/domain/workflow";

describe("workflow journey", () => {
  it("includes due diligence stages when due is enabled", () => {
    const journey = getAllowedJourney(true);
    expect(journey).toContain("levantamento_dados");
    expect(journey).toContain("due_diligence_finalizada");
  });

  it("skips due diligence block when disabled", () => {
    const journey = getAllowedJourney(false);
    expect(journey).not.toContain("levantamento_dados");
    expect(journey[0]).toBe("cadastro_lead");
    expect(journey[1]).toBe("reuniao");
  });

  it("allows first transition from cadastro_lead for non-due lead", () => {
    expect(
      canMoveToStage({
        currentStage: "cadastro_lead",
        nextStage: "reuniao",
        hasDueDiligence: false,
      }),
    ).toBe(true);
  });

  it("allows first transition from cadastro_lead for due lead", () => {
    expect(
      canMoveToStage({
        currentStage: "cadastro_lead",
        nextStage: "levantamento_dados",
        hasDueDiligence: true,
      }),
    ).toBe(true);
  });

  it("allows forward one step", () => {
    expect(
      canMoveToStage({
        currentStage: "reuniao",
        nextStage: "confeccao_proposta",
        hasDueDiligence: false,
      }),
    ).toBe(true);
  });

  it("allows backward one step", () => {
    expect(
      canMoveToStage({
        currentStage: "confeccao_proposta",
        nextStage: "reuniao",
        hasDueDiligence: false,
      }),
    ).toBe(true);
  });

  it("continues into post-sale after signed contract", () => {
    expect(
      canMoveToStage({
        currentStage: "contrato_assinado",
        nextStage: "aguardando_cadastro",
        hasDueDiligence: false,
      }),
    ).toBe(true);
  });

  it("allows post-sale single-step movement", () => {
    expect(
      canMoveToStage({
        currentStage: "cadastro_novo_cliente",
        nextStage: "inclusao_faturamento",
        hasDueDiligence: false,
      }),
    ).toBe(true);
  });

  it("rejects skipping stages", () => {
    expect(
      canMoveToStage({
        currentStage: "reuniao",
        nextStage: "proposta_enviada",
        hasDueDiligence: false,
      }),
    ).toBe(false);
  });
});
