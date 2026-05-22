import type { Oportunidade } from "@/modules/crm/domain/entities";

/** Leads com reconciliação RD no kanban — apenas espelho visual; etapa muda no RD. */
export function isRdKanbanViewOnlyLead(
  item: Pick<Oportunidade, "origemRd">,
): boolean {
  return item.origemRd === true;
}

export const RD_KANBAN_VIEW_ONLY_MESSAGE =
  "Leads sincronizados do RD Station são somente visualização no kanban. A etapa é atualizada no RD.";
