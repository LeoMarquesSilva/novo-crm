import { describe, expect, it } from "vitest";
import {
  buildInvestimentoDocumentoText,
  deriveInvestimentoDocumentoFromAreas,
  documentoFromItems,
  getInvestimentoDocumentoItems,
  getPrimarySumKeyForSubtipo,
  isInvestimentoDocumentoComplete,
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

describe("várias formas de pagamento", () => {
  it("junta o texto de dois itens no documento", () => {
    const doc = documentoFromItems([
      {
        id: "a",
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1.000,00" },
      },
      {
        id: "b",
        tipoId: "honorarios_exito",
        subtipoId: "exito_percentual",
        placeholders: { PORCENTAGEMHONORARIOS: "10", BASECALCULO: "o êxito da demanda" },
      },
    ]);
    const text = buildInvestimentoDocumentoText(doc);
    expect(text).toContain("pagamento mensal de R$ 1.000,00");
    expect(text).toContain("êxito no percentual de 10%");
    expect(getInvestimentoDocumentoItems(doc)).toHaveLength(2);
  });

  it("aplica a soma automática só no primeiro item elegível", () => {
    const saved = documentoFromItems([
      {
        id: "a",
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1,00" },
      },
      {
        id: "b",
        tipoId: "honorarios_contratuais",
        subtipoId: "spot",
        placeholders: { VALORSPOT: "9.999,00" },
        autoSum: false,
      },
    ]);
    const resolved = resolveInvestimentoDocumento(
      {
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
      },
      ["Cível", "Trabalhista"],
      saved,
    );
    const items = getInvestimentoDocumentoItems(resolved);
    expect(items).toHaveLength(2);
    expect(items[0]?.placeholders.VALORMENSAL).toBe("3.000,00");
    expect(items[1]?.placeholders.VALORSPOT).toBe("9.999,00");
  });

  it("item extra vazio não impede completar o investimento", () => {
    const doc = documentoFromItems([
      {
        id: "a",
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1.000,00" },
      },
      {
        id: "b",
        tipoId: "",
        subtipoId: "",
        placeholders: {},
      },
    ]);
    expect(isInvestimentoDocumentoComplete(doc)).toBe(true);
  });

  it("tipo sem subtipo deixa o investimento incompleto", () => {
    const doc = documentoFromItems([
      {
        id: "a",
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1.000,00" },
      },
      {
        id: "b",
        tipoId: "honorarios_exito",
        subtipoId: "",
        placeholders: {},
      },
    ]);
    expect(isInvestimentoDocumentoComplete(doc)).toBe(false);
  });
});
