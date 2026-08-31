import { describe, expect, it } from "vitest";
import {
  deriveInvestimentoDocumentoFromAreas,
  getPrimarySumKeyForSubtipo,
  resolveInvestimentoDocumento,
  sumInvestimentoAreas,
} from "./proposta-investimento-consolidado";
import type { PropostaEscopoDetalhe } from "@/data/proposta-tipos-catalog";

describe("getPrimarySumKeyForSubtipo", () => {
  it("mapeia mensal_fixo para VALORMENSAL", () => {
    expect(getPrimarySumKeyForSubtipo("mensal_fixo")).toBe("VALORMENSAL");
  });

  it("retorna null para exito_percentual", () => {
    expect(getPrimarySumKeyForSubtipo("exito_percentual")).toBeNull();
  });
});

describe("sumInvestimentoAreas", () => {
  const escopo: PropostaEscopoDetalhe = {
    Cível: [
      {
        id: "1",
        tipoId: "contencioso",
        subtipoId: "um_processo",
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "1000" },
        },
      },
    ],
    Trabalhista: [
      {
        id: "2",
        tipoId: "trabalhista",
        subtipoId: "assessoria",
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "2.000,00" },
        },
      },
    ],
  };

  it("soma valores mensais de múltiplas áreas", () => {
    expect(sumInvestimentoAreas(escopo, ["Cível", "Trabalhista"])).toBe(3000);
  });
});

describe("resolveInvestimentoDocumento", () => {
  const escopo: PropostaEscopoDetalhe = {
    Cível: [
      {
        id: "1",
        tipoId: "contencioso",
        subtipoId: "um_processo",
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "1000" },
        },
      },
    ],
    Trabalhista: [
      {
        id: "2",
        tipoId: "trabalhista",
        subtipoId: "assessoria",
        investimento: {
          tipoId: "honorarios_contratuais",
          subtipoId: "mensal_fixo",
          placeholders: { VALORMENSAL: "2000" },
        },
      },
    ],
  };

  it("autoSum calcula total consolidado", () => {
    const resolved = resolveInvestimentoDocumento(escopo, ["Cível", "Trabalhista"], undefined);
    expect(resolved?.placeholders.VALORMENSAL).toBe("3.000,00");
    expect(resolved?.autoSum).toBe(true);
  });

  it("autoSum false preserva valor manual", () => {
    const saved = {
      tipoId: "honorarios_contratuais",
      subtipoId: "mensal_fixo",
      placeholders: { VALORMENSAL: "5.000,00" },
      autoSum: false as const,
    };
    const resolved = resolveInvestimentoDocumento(escopo, ["Cível", "Trabalhista"], saved);
    expect(resolved?.placeholders.VALORMENSAL).toBe("5.000,00");
    expect(resolved?.autoSum).toBe(false);
  });

  it("derive preenche tipo da primeira área", () => {
    const derived = deriveInvestimentoDocumentoFromAreas(escopo, ["Cível", "Trabalhista"]);
    expect(derived?.tipoId).toBe("honorarios_contratuais");
    expect(derived?.subtipoId).toBe("mensal_fixo");
  });
});
