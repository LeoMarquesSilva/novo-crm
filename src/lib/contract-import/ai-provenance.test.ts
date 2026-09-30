import { describe, expect, it } from "vitest";
import type { Json } from "@/lib/supabase/database.types";
import { leBlogExtraction } from "./fixtures/gold-extractions";
import {
  buildImportedOrigemSnapshot,
  parseAiProvenance,
  provenanceFieldStep,
  provenanceLooksAltered,
} from "./ai-provenance";
import { parseContractImportExtraction } from "./schemas";

describe("buildImportedOrigemSnapshot", () => {
  it("grava citações da IA e marca rateio como SIOE", () => {
    const snapshot = buildImportedOrigemSnapshot({
      extraction: leBlogExtraction,
      sioeRateio: {
        shares: [
          { areaKey: "Trabalhista", percentageBasisPoints: 6000, amountCents: 600000 },
          { areaKey: "Cível", percentageBasisPoints: 4000, amountCents: 400000 },
        ],
        totalCents: 1_000_000,
        competency: "2026-09-01",
        situacao: "PAGO",
        ciTitulo: 123,
      },
    });

    expect(snapshot.origin).toBe("contrato");
    expect(snapshot.origem_importacao).toBe("pdf");
    expect(snapshot.reviewedFieldKeys).toEqual([]);
    expect(snapshot.sources.components).toBe("contrato");
    expect(snapshot.sources.allocations).toBe("sioe");
    expect(snapshot.aiProvenance.some((item) => item.field === "adjustmentIndex" && item.source === "contrato")).toBe(true);
    const rateio = snapshot.aiProvenance.find((item) => item.field === "allocations");
    expect(rateio?.source).toBe("sioe");
    expect(rateio?.quote).toContain("SIOE");
    expect(rateio?.extractedValue).toContain("Trabalhista 60%");
  });

  it("reparseia o snapshot sem usar o valor atual da ficha", () => {
    const snapshot = buildImportedOrigemSnapshot({ extraction: leBlogExtraction });
    const parsed = parseAiProvenance(snapshot as Json);
    expect(parsed.items.map((item) => item.quote)).toEqual(snapshot.aiProvenance.map((item) => item.quote));
    expect(parsed.reviewedFieldKeys).toEqual([]);
  });
});

describe("provenance helpers", () => {
  it("classifica campos por etapa e detecta alteração", () => {
    expect(provenanceFieldStep("startsAt")).toBe(0);
    expect(provenanceFieldStep("areas")).toBe(1);
    expect(provenanceFieldStep("components")).toBe(2);
    expect(provenanceFieldStep("allocations")).toBe(3);
    expect(provenanceLooksAltered("2026-08-06", "2026-08-06")).toBe(false);
    expect(provenanceLooksAltered("2026-08-06", "2026-09-01")).toBe(true);
  });

  it("parseia evidence curta do gold Le Blog", () => {
    const parsed = parseContractImportExtraction(leBlogExtraction);
    expect(parsed.evidence.length).toBeGreaterThan(0);
    expect(parsed.evidence.every((item) => item.quote.length <= 160)).toBe(true);
  });
});
