import { describe, expect, it } from "vitest";

import { getClauseTemplate } from "./clause-catalog";
import { applyPartyPlaceholders, contractPartyGrammar, resolvePartyAlternatives } from "./party-language";

const singular = contractPartyGrammar(1);
const plural = contractPartyGrammar(2);

describe("concordância das partes (3º teste ponta a ponta, 22/10/2026)", () => {
  it("resolve {singular|plural} pelo número de contratantes", () => {
    expect(resolvePartyAlternatives("{prestará|prestarão} e {lhe|lhes}", false)).toBe("prestará e lhe");
    expect(resolvePartyAlternatives("{prestará|prestarão} e {lhe|lhes}", true)).toBe("prestarão e lhes");
  });

  it("artigo em maiúscula no começo da frase e crase no plural", () => {
    expect(applyPartyPlaceholders("[A_CONTRATANTE] {paga|pagam}. Depois, [A_CONTRATANTE] {assina|assinam}.", plural)).toBe(
      "As CONTRATANTES pagam. Depois, as CONTRATANTES assinam.",
    );
    expect(applyPartyPlaceholders("devidos [À_CONTRATANTE]", singular)).toBe("devidos à CONTRATANTE");
    expect(applyPartyPlaceholders("devidos [À_CONTRATANTE]", plural)).toBe("devidos às CONTRATANTES");
  });

  it("cláusulas padrão concordam com duas contratantes", () => {
    const contracting = getClauseTemplate("obligation_contracting_base")!.content;
    expect(applyPartyPlaceholders(contracting, plural)).toMatch(
      /^As CONTRATANTES prestarão .* efetuarão .* indicarão /,
    );
    expect(applyPartyPlaceholders(contracting, singular)).toMatch(/^A CONTRATANTE prestará .* efetuará .* indicará /);

    const contracted = getClauseTemplate("obligation_contracted_base")!.content;
    expect(applyPartyPlaceholders(contracted, plural)).toContain("manterá as CONTRATANTES informadas");

    const expense = getClauseTemplate("expense_km")!.content;
    expect(applyPartyPlaceholders(expense, plural)).toContain("custeados pelas CONTRATANTES");
  });
});
