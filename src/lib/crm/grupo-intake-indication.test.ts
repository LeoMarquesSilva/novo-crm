import { describe, expect, it } from "vitest";
import {
  formatGrupoIntakeIndication,
  parseGrupoIntakeIndication,
} from "./grupo-intake-indication";
import { indicationTypes, leadTypes } from "@/modules/crm/application/services/new-lead-payload";

describe("parseGrupoIntakeIndication", () => {
  it("reusa as mesmas chaves do cadastro de lead", () => {
    expect(leadTypes).toContain("Indicacao");
    expect(indicationTypes).toEqual([
      "Fundo",
      "Consultor",
      "Cliente",
      "Contador",
      "Sindicatos",
      "Conselhos profissionais",
      "Colaborador",
      "Outros parceiros",
    ]);
  });

  it("exige subtipo e nome só quando o tipo é Indicação", () => {
    expect(parseGrupoIntakeIndication({ tipoLead: "Lead Digital" })).toEqual({
      ok: true,
      value: { tipoLead: "Lead Digital", tipoIndicacao: null, nomeIndicacao: null },
    });
    expect(parseGrupoIntakeIndication({ tipoLead: "Indicacao" }).ok).toBe(false);
    expect(
      parseGrupoIntakeIndication({
        tipoLead: "Indicacao",
        tipoIndicacao: "Consultor",
      }).ok,
    ).toBe(false);
    expect(
      parseGrupoIntakeIndication({
        tipoLead: "Indicacao",
        tipoIndicacao: "Consultor",
        nomeIndicacao: "  Felipe da Triunfae  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        tipoLead: "Indicacao",
        tipoIndicacao: "Consultor",
        nomeIndicacao: "Felipe da Triunfae",
      },
    });
  });

  it("rejeita taxonomia paralela", () => {
    expect(parseGrupoIntakeIndication({ tipoLead: "Indicação" }).ok).toBe(false);
    expect(
      parseGrupoIntakeIndication({
        tipoLead: "Indicacao",
        tipoIndicacao: "Parceiro",
        nomeIndicacao: "Ana",
      }).ok,
    ).toBe(false);
  });
});

describe("formatGrupoIntakeIndication", () => {
  it("mostra tipo, subtipo e indicador no padrão do lead", () => {
    expect(formatGrupoIntakeIndication(null)).toBe("—");
    expect(
      formatGrupoIntakeIndication({
        tipoLead: "Lead Ativa",
        tipoIndicacao: null,
        nomeIndicacao: null,
      }),
    ).toBe("Lead Ativa");
    expect(
      formatGrupoIntakeIndication({
        tipoLead: "Indicacao",
        tipoIndicacao: "Colaborador",
        nomeIndicacao: "Maria",
      }),
    ).toBe("Indicacao · Colaborador · Maria");
  });
});
