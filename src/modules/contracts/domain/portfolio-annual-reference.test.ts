import { describe, expect, it } from "vitest";

import { annualReferenceCents } from "./portfolio-annual-reference";

describe("annualReferenceCents", () => {
  it("mensalidade fixa sem valor gravado usa a projeção × 12", () => {
    expect(annualReferenceCents({ overrideCents: null, storedCents: null, monthlyCents: 1_500_000, variable: false })).toBe("18000000");
  });

  it("valor manual manda e o gravado vale para cobrança fixa", () => {
    expect(annualReferenceCents({ overrideCents: "100", storedCents: "200", monthlyCents: 300, variable: true })).toBe("100");
    expect(annualReferenceCents({ overrideCents: null, storedCents: "200", monthlyCents: 300, variable: false })).toBe("200");
  });

  it("cobrança variável prefere a projeção; sem projeção nem valor fica vazio", () => {
    expect(annualReferenceCents({ overrideCents: null, storedCents: "200", monthlyCents: 300, variable: true })).toBe("3600");
    expect(annualReferenceCents({ overrideCents: null, storedCents: null, monthlyCents: 0, variable: false })).toBeNull();
  });
});
