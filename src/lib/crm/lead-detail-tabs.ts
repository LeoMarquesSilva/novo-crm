export const LEAD_DETAIL_TAB_VALUES = [
  "overview",
  "due",
  "proposal",
  "contract",
  "billing",
  "crm",
  "signature",
  "history",
  "notes",
] as const;

export type LeadDetailTab = (typeof LEAD_DETAIL_TAB_VALUES)[number];

export function isLeadDetailTab(value: string | null | undefined): value is LeadDetailTab {
  return LEAD_DETAIL_TAB_VALUES.includes(value as LeadDetailTab);
}

export function resolveLeadDetailTab(input: {
  requested: string | null | undefined;
  hasDueDiligence: boolean;
  isProposalStage: boolean;
  isContractStage: boolean;
  showBilling: boolean;
  isRdLead: boolean;
}): LeadDetailTab {
  const fallback: LeadDetailTab = input.isContractStage
    ? "contract"
    : input.isProposalStage
      ? "proposal"
      : "overview";

  if (!isLeadDetailTab(input.requested)) return fallback;
  if (input.requested === "due" && !input.hasDueDiligence) return fallback;
  if (input.requested === "contract" && !input.isContractStage) return fallback;
  if (input.requested === "billing" && !input.showBilling) return fallback;
  if (input.requested === "crm" && !input.isRdLead) return fallback;
  return input.requested;
}
