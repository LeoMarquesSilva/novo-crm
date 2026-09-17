import { describe, expect, it } from "vitest";

import { isProposalDocumentAvailable } from "./proposal-document-availability";

describe("isProposalDocumentAvailable", () => {
  it("mantém a proposta disponível da elaboração em diante", () => {
    expect(isProposalDocumentAvailable("confeccao_proposta")).toBe(true);
    expect(isProposalDocumentAvailable("proposta_enviada")).toBe(true);
    expect(isProposalDocumentAvailable("confeccao_contrato")).toBe(true);
    expect(isProposalDocumentAvailable("contrato_assinado")).toBe(true);
    expect(isProposalDocumentAvailable("inclusao_faturamento")).toBe(true);
  });

  it("não habilita a proposta antes da elaboração", () => {
    expect(isProposalDocumentAvailable("reuniao")).toBe(false);
    expect(isProposalDocumentAvailable("due_diligence_finalizada")).toBe(false);
  });
});
