import { describe, expect, it } from "vitest";

import * as workflowRules from "./workflow-rules";

type BuildBlocker = (
  state: { contractId: string | null; isValid: boolean; code: string | null; reason: string | null },
  opportunityId: string,
) => unknown;

const buildContractTransitionBlocker = (
  workflowRules as unknown as { buildContractTransitionBlocker?: BuildBlocker }
).buildContractTransitionBlocker;

describe("buildContractTransitionBlocker", () => {
  it("returns an actionable bootstrap blocker when the opportunity has no contract", () => {
    const result = buildContractTransitionBlocker?.(
      {
        contractId: null,
        isValid: false,
        code: "contract_not_found",
        reason: "Contrato vinculado não encontrado.",
      },
      "opp-1",
    );

    expect(result).toEqual({
      code: "contract_billing_setup_required",
      message: "Conclua a configuração de faturamento e ative o contrato antes de avançar para Boas-vindas.",
      contractId: null,
      actionHref: "/crm/contratos?setupOpportunityId=opp-1",
    });
  });

  it("opens setup for an invalid linked contract", () => {
    const result = buildContractTransitionBlocker?.(
      {
        contractId: "contract-1",
        isValid: false,
        code: "contract_billing_setup_required",
        reason: "Configuração incompleta.",
      },
      "opp-1",
    );

    expect(result).toEqual({
      code: "contract_billing_setup_required",
      message: "Conclua a configuração de faturamento e ative o contrato antes de avançar para Boas-vindas.",
      contractId: "contract-1",
      actionHref: "/crm/contratos/contract-1?setup=1&returnTo=/crm/leads/opp-1",
    });
  });

  it("does not block a valid billing transition state", () => {
    const result = buildContractTransitionBlocker?.(
      { contractId: "contract-1", isValid: true, code: null, reason: null },
      "opp-1",
    );

    expect(result).toBeNull();
  });
});
