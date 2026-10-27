import { describe, expect, it } from "vitest";
import {
  applyTributacaoPhrase,
  isTributosIncluidos,
  normalizeTributacaoValue,
  TRIBUTACAO_ENGLOBANDO,
  TRIBUTACAO_LIQUIDO,
} from "./proposta-tributacao";

describe("proposta-tributacao", () => {
  it("normaliza rótulos novos e valores do catálogo", () => {
    expect(normalizeTributacaoValue("Incluindo tributos")).toBe(TRIBUTACAO_ENGLOBANDO);
    expect(normalizeTributacaoValue("Não incluindo tributos")).toBe(TRIBUTACAO_LIQUIDO);
    expect(normalizeTributacaoValue(TRIBUTACAO_LIQUIDO)).toBe(TRIBUTACAO_LIQUIDO);
  });

  it("sem escolha trata como incluindo tributos", () => {
    expect(isTributosIncluidos("")).toBe(true);
    expect(isTributosIncluidos(TRIBUTACAO_ENGLOBANDO)).toBe(true);
    expect(isTributosIncluidos(TRIBUTACAO_LIQUIDO)).toBe(false);
  });

  it("modelo sem a frase dos tributos ganha frase própria quando a tributação foi escolhida", () => {
    const base = "propõe-se o pagamento mensal de R$ 15.000,00 (quinze mil reais).";
    expect(applyTributacaoPhrase(base, TRIBUTACAO_LIQUIDO)).toBe(
      `${base}\n\nOs valores acima não incluem os tributos incidentes.`,
    );
    expect(applyTributacaoPhrase(base, TRIBUTACAO_ENGLOBANDO)).toBe(
      `${base}\n\nOs valores acima já incluem os tributos incidentes.`,
    );
    expect(applyTributacaoPhrase(base, "")).toBe(base);
    expect(applyTributacaoPhrase("honorários de êxito de 3% sobre o deságio.", TRIBUTACAO_LIQUIDO)).toBe(
      "honorários de êxito de 3% sobre o deságio.",
    );
  });

  it("troca a frase no texto de investimento", () => {
    const base = "propõe-se o pagamento mensal de R$ 1.000,00, já incluídos os tributos incidentes.";
    expect(applyTributacaoPhrase(base, TRIBUTACAO_LIQUIDO)).toContain(
      "não incluídos os tributos incidentes",
    );
    expect(applyTributacaoPhrase(base, TRIBUTACAO_ENGLOBANDO)).toContain(
      "já incluídos os tributos incidentes",
    );
  });
});
