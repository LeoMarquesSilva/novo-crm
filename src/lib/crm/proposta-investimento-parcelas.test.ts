import { describe, expect, it } from "vitest";
import {
  formatDetalheParcelasForMerge,
  formatParcelaVencimentoSuffix,
  formatValorParcelaPlaceholderForMerge,
  validateParcelasPlaceholders,
} from "./proposta-investimento-parcelas";

describe("proposta-investimento-parcelas", () => {
  it("formata parcelas iguais sem vencimento", () => {
    const text = formatValorParcelaPlaceholderForMerge({
      PARCELAS: "3",
      PARCELAS_IGUAIS: "sim",
      VALORPARCELA: "2500",
    });
    expect(text).toContain("2.500,00");
    expect(text).not.toContain("1ª parcela");
  });

  it("formata parcelas distintas sem vencimento", () => {
    const text = formatValorParcelaPlaceholderForMerge({
      PARCELAS: "2",
      PARCELAS_IGUAIS: "nao",
      PARCELAS_VALORES: "1000|2000",
    });
    expect(text).toContain("1ª parcela");
    expect(text).toContain("2ª parcela");
  });

  it("formata parcelas com vencimento (estilo contrato)", () => {
    const text = formatDetalheParcelasForMerge({
      PARCELAS: "2",
      PARCELAS_IGUAIS: "nao",
      PARCELAS_VALORES: "10000|7200",
      PARCELAS_VENCIMENTOS:
        "na data de assinatura do Contrato|na data de entrega dos documentos",
    });
    expect(text).toContain("a serem pagos em duas parcelas");
    expect(text).toContain("sendo a primeira no valor de R$ 10.000,00");
    expect(text).toContain("e a segunda no valor de R$ 7.200,00");
    expect(text).toContain("na data de assinatura do Contrato");
    expect(text).toContain("na data de entrega dos documentos");
  });

  it("à vista quando zero parcelas", () => {
    expect(formatDetalheParcelasForMerge({ PARCELAS: "0" })).toBe("para pagamento à vista");
  });

  it("preview com vencimento parcial (uma parcela preenchida)", () => {
    const text = formatDetalheParcelasForMerge({
      PARCELAS: "2",
      PARCELAS_IGUAIS: "nao",
      PARCELAS_VALORES: "10000|7200",
      PARCELAS_VENCIMENTOS: "na data de assinatura do Contrato|",
    });
    expect(text).toContain("na data de assinatura do Contrato");
    expect(text).toContain("sendo a primeira");
  });

  it("valida parcelas distintas e vencimentos", () => {
    expect(
      validateParcelasPlaceholders({
        PARCELAS: "2",
        PARCELAS_IGUAIS: "nao",
        PARCELAS_VALORES: "1000|2000",
        PARCELAS_VENCIMENTOS: "na assinatura|na entrega",
      }),
    ).toBe(true);
    expect(
      validateParcelasPlaceholders({
        PARCELAS: "2",
        PARCELAS_IGUAIS: "nao",
        PARCELAS_VALORES: "1000|2000",
        PARCELAS_VENCIMENTOS: "na assinatura|",
      }),
    ).toBe(false);
  });

  it("formatParcelaVencimentoSuffix aceita frase com na/em", () => {
    expect(formatParcelaVencimentoSuffix("na data de assinatura")).toBe(" na data de assinatura");
    expect(formatParcelaVencimentoSuffix("30 dias")).toBe(" na 30 dias");
  });
});
