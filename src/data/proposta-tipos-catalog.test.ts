import { describe, expect, it } from "vitest";
import { extractPlaceholderKeysFromText, mergePlaceholderKeys } from "@/data/proposta-tipos-catalog";
import { cleanPlaceholders } from "@/lib/crm/proposal-catalog-write";

describe("mergePlaceholderKeys", () => {
  it("une chaves declaradas com as do template", () => {
    expect(
      mergePlaceholderKeys(
        ["QTD DE PROCESSOS"],
        "Atuação limitada a [QTD DE PROCESSOS] e [VL ADICIONAL DE PROCESSO] por excedente.",
      ),
    ).toEqual(["QTD DE PROCESSOS", "VL ADICIONAL DE PROCESSO"]);
  });

  it("não descarta chave extra só do Word", () => {
    expect(mergePlaceholderKeys(["RESUMO_DO_PROCESSO"], "Texto sem chave.")).toEqual([
      "RESUMO_DO_PROCESSO",
    ]);
  });
});

describe("cleanPlaceholders", () => {
  it("não ignora placeholders novos do texto quando já existe lista declarada", () => {
    expect(
      cleanPlaceholders(
        ["QTD DE PROCESSOS"],
        "limitada a [QTD DE PROCESSOS]; adicional [VL ADICIONAL DE PROCESSO]",
      ),
    ).toEqual(["QTD DE PROCESSOS", "VL ADICIONAL DE PROCESSO"]);
  });

  it("extrai do texto quando a lista declarada vem vazia", () => {
    expect(cleanPlaceholders([], "Defesa de [NOME EMPRESA]")).toEqual(
      extractPlaceholderKeysFromText("Defesa de [NOME EMPRESA]"),
    );
  });
});
