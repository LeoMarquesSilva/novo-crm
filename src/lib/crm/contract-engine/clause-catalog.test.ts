import { describe, expect, it } from "vitest";
import { CONTRACT_CLAUSE_CATALOG } from "./clause-catalog";

describe("CONTRACT_CLAUSE_CATALOG", () => {
  it("nunca deixa nota de revisão jurídica vazar para o texto renderizado (content)", () => {
    // Achado real: "Tributos" carregava "REQUIRES LEGAL DECISION: ..." dentro do
    // próprio `content` (o texto que vai pro contrato assinado pelo cliente),
    // em vez de só em `legalReviewNote` (campo interno, nunca renderizado).
    const leaking = CONTRACT_CLAUSE_CATALOG.filter((c) => /REQUIRES LEGAL DECISION/i.test(c.content));
    expect(leaking.map((c) => c.stableKey)).toEqual([]);
  });
});
