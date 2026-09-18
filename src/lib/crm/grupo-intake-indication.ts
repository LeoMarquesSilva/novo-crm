import {
  indicationTypes,
  leadTypes,
} from "@/modules/crm/application/services/new-lead-payload";

export const GRUPO_INTAKE_LEAD_TYPES = leadTypes;
export const GRUPO_INTAKE_INDICATION_TYPES = indicationTypes;

export type GrupoIntakeLeadType = (typeof leadTypes)[number];
export type GrupoIntakeIndicationType = (typeof indicationTypes)[number];

export type GrupoIntakeIndication = {
  tipoLead: GrupoIntakeLeadType;
  tipoIndicacao: GrupoIntakeIndicationType | null;
  nomeIndicacao: string | null;
};

export function isGrupoIntakeLeadType(value: unknown): value is GrupoIntakeLeadType {
  return typeof value === "string" && (leadTypes as readonly string[]).includes(value);
}

export function isGrupoIntakeIndicationType(
  value: unknown,
): value is GrupoIntakeIndicationType {
  return typeof value === "string" && (indicationTypes as readonly string[]).includes(value);
}

export function formatGrupoIntakeIndication(value: GrupoIntakeIndication | null | undefined): string {
  if (!value?.tipoLead) return "—";
  if (value.tipoLead !== "Indicacao") return value.tipoLead;
  const parts = [value.tipoLead, value.tipoIndicacao, value.nomeIndicacao?.trim()].filter(Boolean);
  return parts.join(" · ");
}

export function parseGrupoIntakeIndication(input: {
  tipoLead?: unknown;
  tipoIndicacao?: unknown;
  nomeIndicacao?: unknown;
}): { ok: true; value: GrupoIntakeIndication } | { ok: false; error: string } {
  if (!isGrupoIntakeLeadType(input.tipoLead)) {
    return { ok: false, error: "Selecione o tipo de origem (mesmo padrão do cadastro de lead)." };
  }

  if (input.tipoLead !== "Indicacao") {
    return {
      ok: true,
      value: {
        tipoLead: input.tipoLead,
        tipoIndicacao: null,
        nomeIndicacao: null,
      },
    };
  }

  if (!isGrupoIntakeIndicationType(input.tipoIndicacao)) {
    return { ok: false, error: "Tipo de indicação é obrigatório para origem Indicação." };
  }

  const nome = typeof input.nomeIndicacao === "string" ? input.nomeIndicacao.trim() : "";
  if (!nome) {
    return { ok: false, error: "Nome de quem indicou é obrigatório para origem Indicação." };
  }

  return {
    ok: true,
    value: {
      tipoLead: "Indicacao",
      tipoIndicacao: input.tipoIndicacao,
      nomeIndicacao: nome,
    },
  };
}
