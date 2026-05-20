import { DemandType } from "@/modules/crm/domain/entities";

interface OpenDemandInput {
  type: DemandType;
  clientId?: string;
  contractId?: string;
}

export interface OpenDemandResult {
  valid: boolean;
  errors: string[];
}

export function validateOpenDemand(input: OpenDemandInput): OpenDemandResult {
  if (input.type === "novo_lead") {
    return { valid: true, errors: [] };
  }

  if (!input.clientId) {
    return {
      valid: false,
      errors: ["Cliente é obrigatório para novo_contrato e aditivo."],
    };
  }

  if (input.type === "aditivo" && !input.contractId) {
    return {
      valid: false,
      errors: ["Contrato base é obrigatório para aditivo."],
    };
  }

  return { valid: true, errors: [] };
}
