export type PartnerShareOrigin =
  | "captacao_gustavo"
  | "captacao_ricardo"
  | "corporate"
  | "gaspec"
  | "marketing"
  | "organico"
  | "indicacao_colaborador"
  | "excecao";

export type PartnerShareSuggestion = {
  value: Array<{
    beneficiary: "gustavo" | "ricardo" | "captor";
    percentageBasisPoints: number;
  }>;
  source: "policy";
  requiresConfirmation: true;
  requiresReason: boolean;
  rule: string;
};

const CURRENT_POLICY_START = "2023-04-01";

function suggestion(
  rule: string,
  value: PartnerShareSuggestion["value"],
  requiresReason = false,
): PartnerShareSuggestion {
  return {
    value,
    source: "policy",
    requiresConfirmation: true,
    requiresReason,
    rule,
  };
}

export function suggestPartnerShares(input: {
  signedAt: string;
  origin: PartnerShareOrigin;
}): PartnerShareSuggestion {
  if (input.origin === "excecao") {
    return suggestion("contractual_exception", [], true);
  }

  if (input.signedAt < CURRENT_POLICY_START) {
    const beneficiary = input.origin === "captacao_gustavo"
      ? "gustavo"
      : input.origin === "captacao_ricardo"
        ? "ricardo"
        : "captor";
    return suggestion("legacy_captor_100", [{ beneficiary, percentageBasisPoints: 10_000 }]);
  }

  switch (input.origin) {
    case "captacao_gustavo":
      return suggestion("captacao_gustavo_60_40", [
        { beneficiary: "gustavo", percentageBasisPoints: 6_000 },
        { beneficiary: "ricardo", percentageBasisPoints: 4_000 },
      ]);
    case "captacao_ricardo":
      return suggestion("captacao_ricardo_60_40", [
        { beneficiary: "ricardo", percentageBasisPoints: 6_000 },
        { beneficiary: "gustavo", percentageBasisPoints: 4_000 },
      ]);
    case "corporate":
    case "gaspec":
      return suggestion(`${input.origin}_50_50`, [
        { beneficiary: "gustavo", percentageBasisPoints: 5_000 },
        { beneficiary: "ricardo", percentageBasisPoints: 5_000 },
      ]);
    case "marketing":
    case "organico":
    case "indicacao_colaborador":
      return suggestion(`${input.origin}_63_37`, [
        { beneficiary: "gustavo", percentageBasisPoints: 6_300 },
        { beneficiary: "ricardo", percentageBasisPoints: 3_700 },
      ]);
  }
}
