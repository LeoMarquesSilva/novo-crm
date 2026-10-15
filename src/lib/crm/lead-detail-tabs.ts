export const LEAD_DETAIL_TAB_VALUES = [
  "overview",
  "due",
  "proposal",
  "contract",
  "billing",
  "onboarding",
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
  /** Aba "Cadastro" (pós-venda, lead criado no CRM). */
  showOnboarding?: boolean;
  /** Etapa de cadastro do cliente (Aguardando Cadastro / Cadastro de Novo Cliente): abre o Cadastro. */
  isOnboardingStage?: boolean;
  /** Inclusão no faturamento: abre o Faturamento. */
  isBillingStage?: boolean;
}): LeadDetailTab {
  const fallback: LeadDetailTab =
    input.showOnboarding && input.isOnboardingStage
      ? "onboarding"
      : input.showBilling && input.isBillingStage
        ? "billing"
        : input.isContractStage
          ? "contract"
          : input.isProposalStage
            ? "proposal"
            : "overview";

  if (!isLeadDetailTab(input.requested)) return fallback;
  if (input.requested === "due" && !input.hasDueDiligence) return fallback;
  if (input.requested === "contract" && !input.isContractStage) return fallback;
  if (input.requested === "billing" && !input.showBilling) return fallback;
  if (input.requested === "onboarding" && !input.showOnboarding) return fallback;
  if (input.requested === "crm" && !input.isRdLead) return fallback;
  return input.requested;
}
