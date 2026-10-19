import { describe, expect, it } from "vitest";
import { mergeInvestimentoTemplate } from "./proposta-escopo-preview";
import {
  computeValorParcelaIgual,
  encodeParcelasList,
  formatDetalheParcelasForMerge,
  formatParcelaVencimentoSuffix,
  formatValorParcelaPlaceholderForMerge,
  normalizeParcelaVencimento,
  validateParcelasPlaceholders,
} from "./proposta-investimento-parcelas";

/** Modelo SPOT como está no catálogo do banco (`proposal_investment_subtypes`, 18/10/2026). */
const SPOT_CATALOGO_BANCO =
  "Os honorários advocatícios para o desempenho especializado do escopo detalhado anteriormente serão fixados em R$ [VALORSPOT], já incluídos os tributos incidentes, para pagamento à vista ou, ainda, em até [PARCELAS] parcelas mensais e sucessivas de R$ [VALORPARCELA].";
/** SPOT condicionado no banco (termina com "cada"). */
const SPOT_CONDICIONADO_CATALOGO_BANCO =
  "Os honorários advocatícios para eventual execução do escopo acima descrito, mediante solicitação formal da Cliente, serão fixados em R$ [VALORSPOT], já incluídos os tributos incidentes, para pagamento à vista ou em até [PARCELAS] parcelas mensais e sucessivas de R$ [VALORPARCELA] cada.";

/** Investimento SPOT do teste E2E de 18/10/2026 (Renato Marotta Starek). */
const SPOT_E2E = {
  VALORSPOT: "R$ 12.000,00",
  PARCELAS: "5",
  PARCELAS_IGUAIS: "sim",
  VALORPARCELA: "2.400,00",
  PARCELAS_VENCIMENTOS: encodeParcelasList([
    "na data de assinatura do Contrato",
    "30 dias após a 1ª parcela",
    "60 dias após a 1ª parcela",
    "90 dias após a 1ª parcela",
    "120 dias após a 1ª parcela",
  ]),
};

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
    expect(formatParcelaVencimentoSuffix("30 dias")).toBe(" 30 dias");
    expect(formatParcelaVencimentoSuffix("")).toBe("");
  });

  it("normaliza vencimento sem gerar 'na 30 dias'", () => {
    expect(normalizeParcelaVencimento("30 dias após a 1ª parcela")).toBe("30 dias após a 1ª parcela");
    expect(normalizeParcelaVencimento("Na data de assinatura do Contrato.")).toBe(
      "na data de assinatura do Contrato",
    );
    expect(normalizeParcelaVencimento("data de assinatura do Contrato")).toBe(
      "na data de assinatura do Contrato",
    );
    expect(normalizeParcelaVencimento("10/11/2026")).toBe("em 10/11/2026");
    expect(normalizeParcelaVencimento("dia 10 de novembro")).toBe("no dia 10 de novembro");
    expect(normalizeParcelaVencimento("após a entrega do parecer")).toBe("após a entrega do parecer");
  });

  it("computeValorParcelaIgual divide VALORSPOT pelo número de parcelas", () => {
    expect(
      computeValorParcelaIgual({ VALORSPOT: "10.000,00", PARCELAS: "2" }, 2),
    ).toBe("5.000,00");
    expect(
      computeValorParcelaIgual({ VALORSPOT: "10.000,00", PARCELAS: "3" }, 3),
    ).toBe("3.333,33");
    expect(computeValorParcelaIgual({ VALORSPOT: "", PARCELAS: "2" }, 2)).toBeNull();
  });
});

describe("SPOT no Word/PDF (modelo do catálogo do banco)", () => {
  it("parcelas iguais com vencimento: texto gramatical, sem 'de R$ a serem pagos' nem 'na 30 dias'", () => {
    const text = mergeInvestimentoTemplate(SPOT_CATALOGO_BANCO, SPOT_E2E);
    expect(text).toBe(
      "Os honorários advocatícios para o desempenho especializado do escopo detalhado anteriormente serão fixados em R$ 12.000,00 (doze mil reais), já incluídos os tributos incidentes, a serem pagos em cinco parcelas iguais de R$ 2.400,00 (dois mil e quatrocentos reais), vencendo a primeira na data de assinatura do Contrato, a segunda 30 dias após a 1ª parcela, a terceira 60 dias após a 1ª parcela, a quarta 90 dias após a 1ª parcela e a quinta 120 dias após a 1ª parcela.",
    );
  });

  it("parcelas distintas com vencimento", () => {
    const text = mergeInvestimentoTemplate(SPOT_CATALOGO_BANCO, {
      VALORSPOT: "17.200,00",
      PARCELAS: "2",
      PARCELAS_IGUAIS: "nao",
      VALORPARCELA: "10.000,00",
      PARCELAS_VALORES: encodeParcelasList(["10.000,00", "7.200,00"]),
      PARCELAS_VENCIMENTOS: encodeParcelasList([
        "na data de assinatura do Contrato",
        "30 dias após a 1ª parcela",
      ]),
    });
    expect(text).toContain(
      "já incluídos os tributos incidentes, a serem pagos em duas parcelas, sendo a primeira no valor de R$ 10.000,00 (dez mil reais), vencível na data de assinatura do Contrato, e a segunda no valor de R$ 7.200,00 (sete mil e duzentos reais), vencível 30 dias após a 1ª parcela.",
    );
    expect(text).not.toMatch(/de R\$ a serem/);
  });

  it("parcelas iguais sem vencimento mantém a opção à vista", () => {
    const text = mergeInvestimentoTemplate(SPOT_CATALOGO_BANCO, {
      VALORSPOT: "12.000,00",
      PARCELAS: "5",
      PARCELAS_IGUAIS: "sim",
      VALORPARCELA: "2.400,00",
    });
    expect(text).toContain(
      "para pagamento à vista ou, ainda, em até 5 parcelas mensais e sucessivas de R$ 2.400,00 (dois mil e quatrocentos reais) cada.",
    );
  });

  it("SPOT condicionado (com 'cada' no modelo) não duplica 'cada'", () => {
    const text = mergeInvestimentoTemplate(SPOT_CONDICIONADO_CATALOGO_BANCO, SPOT_E2E);
    expect(text).toContain("a serem pagos em cinco parcelas iguais de R$ 2.400,00");
    expect(text).toContain("e a quinta 120 dias após a 1ª parcela.");
    expect(text).not.toMatch(/cada/);
  });

  it("zero parcelas vira pagamento à vista", () => {
    const text = mergeInvestimentoTemplate(SPOT_CATALOGO_BANCO, {
      VALORSPOT: "12.000,00",
      PARCELAS: "0",
    });
    expect(text).toContain("já incluídos os tributos incidentes, para pagamento à vista.");
  });

  it("preview do catálogo com exemplos (sem número de parcelas) mantém o modelo", () => {
    const text = mergeInvestimentoTemplate(SPOT_CATALOGO_BANCO, {
      VALORSPOT: "25000",
      PARCELAS: "[exemplo: parcelas]",
      VALORPARCELA: "2500",
    });
    expect(text).toContain("em até [exemplo: parcelas] parcelas mensais e sucessivas de R$ 2.500,00");
  });

  it("modelo fora do padrão: [VALORPARCELA] com vencimento continua gramatical", () => {
    const text = mergeInvestimentoTemplate(
      "Pagamento em [PARCELAS] parcelas de R$ [VALORPARCELA].",
      SPOT_E2E,
    );
    expect(text).toBe(
      "Pagamento em 5 parcelas de R$ 2.400,00 (dois mil e quatrocentos reais), vencendo a primeira na data de assinatura do Contrato, a segunda 30 dias após a 1ª parcela, a terceira 60 dias após a 1ª parcela, a quarta 90 dias após a 1ª parcela e a quinta 120 dias após a 1ª parcela.",
    );
  });
});
