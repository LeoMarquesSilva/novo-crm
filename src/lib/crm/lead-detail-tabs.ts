export const LEAD_DETAIL_TAB_VALUES = [
  "overview",
  "due",
  "proposal",
  "contract",
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
  isRdLead: boolean;
  /** Aba "Cadastro" (pós-venda, lead criado no CRM). */
  showOnboarding?: boolean;
  /** Etapa de cadastro do cliente (Aguardando Cadastro / Cadastro de Novo Cliente): abre o Cadastro. */
  isOnboardingStage?: boolean;
}): LeadDetailTab {
  // Sem aba Faturamento (03/11/2026): Inclusão no Faturamento e links antigos `?tab=billing` abrem a Visão geral.
  const fallback: LeadDetailTab =
    input.showOnboarding && input.isOnboardingStage
      ? "onboarding"
      : input.isContractStage
        ? "contract"
        : input.isProposalStage
          ? "proposal"
          : "overview";

  if (!isLeadDetailTab(input.requested)) return fallback;
  if (input.requested === "due" && !input.hasDueDiligence) return fallback;
  if (input.requested === "contract" && !input.isContractStage) return fallback;
  if (input.requested === "onboarding" && !input.showOnboarding) return fallback;
  if (input.requested === "crm" && !input.isRdLead) return fallback;
  return input.requested;
}
