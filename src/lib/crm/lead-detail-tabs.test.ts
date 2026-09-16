import { describe, expect, it } from "vitest";

import { resolveLeadDetailTab } from "./lead-detail-tabs";

const base = {
  hasDueDiligence: true,
  isProposalStage: false,
  isContractStage: false,
  showBilling: false,
  isRdLead: false,
};

describe("resolveLeadDetailTab", () => {
  it("abre a tab solicitada quando ela está disponível", () => {
    expect(resolveLeadDetailTab({ ...base, requested: "due" })).toBe("due");
  });

  it("preserva o fallback contextual quando não há parâmetro", () => {
    expect(
      resolveLeadDetailTab({ ...base, requested: null, isContractStage: true }),
    ).toBe("contract");
    expect(
      resolveLeadDetailTab({ ...base, requested: null, isProposalStage: true }),
    ).toBe("proposal");
  });

  it("não abre tabs contextuais indisponíveis", () => {
    expect(
      resolveLeadDetailTab({ ...base, requested: "due", hasDueDiligence: false }),
    ).toBe("overview");
    expect(resolveLeadDetailTab({ ...base, requested: "contract" })).toBe("overview");
    expect(resolveLeadDetailTab({ ...base, requested: "billing" })).toBe("overview");
    expect(resolveLeadDetailTab({ ...base, requested: "crm" })).toBe("overview");
  });

  it("ignora valores desconhecidos", () => {
    expect(resolveLeadDetailTab({ ...base, requested: "documentos" })).toBe("overview");
  });
});
