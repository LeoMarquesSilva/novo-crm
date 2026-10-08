import { leadTypes } from "@/modules/crm/application/services/new-lead-payload";

/**
 * Rótulo visível de cada tipo de origem.
 * A chave gravada (`Indicacao`, `Lead Ativa`, …) não muda.
 */
const LEAD_TYPE_LABELS: Record<(typeof leadTypes)[number], string> = {
  Indicacao: "Indicação",
  "Lead Ativa": "Lead Ativa",
  "Lead Digital": "Lead Digital",
  "Lead Passiva": "Lead Passiva",
  "Cross Selling": "Cross Selling",
};

export function leadTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  if ((leadTypes as readonly string[]).includes(value)) {
    return LEAD_TYPE_LABELS[value as (typeof leadTypes)[number]];
  }
  return value;
}

export const LEAD_TYPE_SELECT_LABELS: Record<string, string> = Object.fromEntries(
  leadTypes.map((item) => [item, leadTypeLabel(item)]),
);
