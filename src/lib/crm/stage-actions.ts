import type { StageActionKind } from "@/modules/crm/domain/stage-transition-rules";

/** Aba da ficha do lead que abre a ação própria de cada mudança de etapa. */
export function stageActionHref(kind: StageActionKind, opportunityId: string): string {
  const base = `/crm/leads/${encodeURIComponent(opportunityId)}`;
  switch (kind) {
    case "open_send_dialog":
      return `${base}?tab=contract&send=1`;
    case "open_onboarding":
    case "open_ops_panel":
    case "open_billing":
      return `${base}?tab=onboarding`;
    case "open_contract_setup":
      return `${base}?tab=billing`;
  }
}

export const STAGE_ACTION_LABELS: Record<StageActionKind, string> = {
  open_send_dialog: "Enviar para assinatura",
  open_onboarding: "Abrir cadastro do cliente",
  open_ops_panel: "Abrir painel de Operações Legais",
  open_billing: "Abrir dados do faturamento",
  open_contract_setup: "Abrir inclusão no faturamento",
};
