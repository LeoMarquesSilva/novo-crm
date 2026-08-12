import { describe, expect, it } from "vitest";
import { transitionOpportunity } from "@/modules/crm/application/services/transition-opportunity";

describe("transitionOpportunity", () => {
  it("returns error when jumping stages", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "reuniao",
      nextStage: "proposta_enviada",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Transição inválida");
  });

  it("allows single step backward without extra payload when target has no requirements", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "confeccao_proposta",
      nextStage: "reuniao",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {},
    });

    expect(result.ok).toBe(true);
  });

  it("validates required fields for proposta and contrato stages", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "confeccao_proposta",
      nextStage: "proposta_enviada",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("linkProposta");
  });

  it("returns audit record for valid transition", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "confeccao_proposta",
      nextStage: "proposta_enviada",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {
        linkProposta: "https://sharepoint.local/proposta-1",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.audit?.opportunityId).toBe("opp_1");
    expect(result.audit?.from).toBe("confeccao_proposta");
    expect(result.audit?.to).toBe("proposta_enviada");
  });

  it("allows entering billing inclusion before the financial setup is complete", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "cadastro_novo_cliente",
      nextStage: "inclusao_faturamento",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {},
    });

    expect(result.ok).toBe(true);
  });

  it("blocks leaving billing inclusion while the financial setup is incomplete", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "inclusao_faturamento",
      nextStage: "boas_vindas",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: {},
    });

    expect(result).toEqual({
      ok: false,
      errors: ["Campo obrigatório ausente: financeiroConcluido"],
    });
  });

  it("allows leaving billing inclusion after the financial setup is complete", () => {
    const result = transitionOpportunity({
      opportunityId: "opp_1",
      currentStage: "inclusao_faturamento",
      nextStage: "boas_vindas",
      hasDueDiligence: false,
      changedBy: "user_1",
      payload: { financeiroConcluido: true },
    });

    expect(result.ok).toBe(true);
  });
});
