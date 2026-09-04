import { describe, expect, it } from "vitest";
import { INVESTIMENTO_DOCUMENTO_KEY } from "@/data/proposta-tipos-catalog";
import {
  normalizeInvestimentoDocumento,
  parseEscopoJsonWithMeta,
  stringifyEscopoJsonWithMeta,
} from "./proposta-escopo-json";

describe("normalizeInvestimentoDocumento", () => {
  it("converte o formato legado num único item estável", () => {
    const doc = normalizeInvestimentoDocumento({
      tipoId: "honorarios_contratuais",
      subtipoId: "mensal_fixo",
      placeholders: { VALORMENSAL: "1.000,00" },
    });
    expect(doc?.items).toHaveLength(1);
    expect(doc?.items?.[0]?.id).toBe("inv-0");
    expect(doc?.items?.[0]?.tipoId).toBe("honorarios_contratuais");
    expect(doc?.tipoId).toBe("honorarios_contratuais");
  });

  it("preserva várias formas no JSON", () => {
    const json = stringifyEscopoJsonWithMeta(
      {},
      {
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "1.000,00" },
        items: [
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
            placeholders: { PORCENTAGEMHONORARIOS: "10", BASECALCULO: "base" },
          },
        ],
      },
    );
    const parsed = parseEscopoJsonWithMeta(json);
    expect(parsed.investimentoDocumento?.items).toHaveLength(2);
    expect(parsed.investimentoDocumento?.items?.[1]?.id).toBe("b");
    expect(json).toContain(INVESTIMENTO_DOCUMENTO_KEY);
  });
});
