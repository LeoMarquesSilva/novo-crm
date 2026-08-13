import { describe, expect, it } from "vitest";
import {
  normalizeAreaKey,
  parseConsolidationResponse,
  parseExtractionResponse,
  recomputePlaceholderKeys,
} from "./schemas";

describe("scope-import schemas", () => {
  it("valida resposta de extração", () => {
    const parsed = parseExtractionResponse({
      escopos: [
        {
          raw_excerpt: "ACME Ltda",
          normalized_template: "Cliente [NOME EMPRESA]",
          suggested_area_key: "Cível",
          suggested_type_label: "Contencioso",
          suggested_subtype_label: "Um processo",
          replaced_values: { "ACME Ltda": "[NOME EMPRESA]" },
        },
      ],
      investimentos: [],
    });
    expect(parsed.escopos).toHaveLength(1);
  });

  it("rejeita área inválida via normalizeAreaKey", () => {
    expect(normalizeAreaKey("Cível")).toEqual({ areaKey: "Cível", invalidArea: false });
    expect(normalizeAreaKey("Inexistente")).toEqual({ areaKey: null, invalidArea: true });
  });

  it("recomputa placeholder keys do template", () => {
    const keys = recomputePlaceholderKeys("Honorários de [VALORMENSAL] para [NOME EMPRESA]");
    expect(keys).toContain("VALORMENSAL");
    expect(keys).toContain("NOME EMPRESA");
  });

  it("valida consolidação", () => {
    const parsed = parseConsolidationResponse({
      suggestions: [
        {
          template: "Escopo [NOME EMPRESA]",
          tipo_label: "Tipo A",
          subtipo_label: "Sub A",
          source_extraction_indices: [0, 1],
          confidence: 0.82,
        },
      ],
    });
    expect(parsed.suggestions[0].confidence).toBe(0.82);
  });
});
