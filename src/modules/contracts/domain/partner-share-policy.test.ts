import { describe, expect, it } from "vitest";

import { suggestPartnerShares } from "./partner-share-policy";

describe("suggestPartnerShares", () => {
  it.each([
    ["captacao_gustavo", [["gustavo", 6_000], ["ricardo", 4_000]], "captacao_gustavo_60_40"],
    ["captacao_ricardo", [["ricardo", 6_000], ["gustavo", 4_000]], "captacao_ricardo_60_40"],
    ["corporate", [["gustavo", 5_000], ["ricardo", 5_000]], "corporate_50_50"],
    ["gaspec", [["gustavo", 5_000], ["ricardo", 5_000]], "gaspec_50_50"],
    ["marketing", [["gustavo", 6_300], ["ricardo", 3_700]], "marketing_63_37"],
    ["organico", [["gustavo", 6_300], ["ricardo", 3_700]], "organico_63_37"],
    ["indicacao_colaborador", [["gustavo", 6_300], ["ricardo", 3_700]], "indicacao_colaborador_63_37"],
  ] as const)("suggests the current split for %s", (origin, expectedShares, rule) => {
    const suggestion = suggestPartnerShares({ signedAt: "2023-04-01", origin });

    expect(suggestion).toEqual({
      value: expectedShares.map(([beneficiary, percentageBasisPoints]) => ({
        beneficiary,
        percentageBasisPoints,
      })),
      source: "policy",
      requiresConfirmation: true,
      requiresReason: false,
      rule,
    });
  });

  it.each([
    ["captacao_gustavo", "gustavo"],
    ["captacao_ricardo", "ricardo"],
  ] as const)("assigns 100%% to the captor before the strict cutoff for %s", (origin, beneficiary) => {
    expect(suggestPartnerShares({ signedAt: "2023-03-31", origin })).toEqual({
      value: [{ beneficiary, percentageBasisPoints: 10_000 }],
      source: "policy",
      requiresConfirmation: true,
      requiresReason: false,
      rule: "legacy_captor_100",
    });
  });

  it("does not fabricate percentages for a contractual exception", () => {
    expect(suggestPartnerShares({ signedAt: "2026-08-01", origin: "excecao" })).toEqual({
      value: [],
      source: "policy",
      requiresConfirmation: true,
      requiresReason: true,
      rule: "contractual_exception",
    });
  });
});
