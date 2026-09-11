import { describe, expect, it } from "vitest";
import { applyProposalScopeSave, isProposalScopeAreaDirty } from "./proposta-escopo-draft";
import { parseEscopoJson, parseEscopoJsonWithMeta, stringifyEscopoJsonWithMeta } from "./proposta-escopo-json";
import { resolveInvestimentoDocumento } from "./proposta-investimento-consolidado";

const areaEntry = (id: string, amount: string) => [{
  id, tipoId: "consultivo", subtipoId: "consultoria",
  placeholders: { "NOME EMPRESA": "ACME" },
  investimento: { tipoId: "honorarios_contratuais", subtipoId: "mensal_fixo", placeholders: { VALORMENSAL: amount } },
}];
const saved = JSON.stringify({ "Cível": areaEntry("civel-1", "1000"), "Trabalhista": areaEntry("trab-1", "500") });

describe("proposal scope saved baseline", () => {
  it("mantém a área dirty após o parent recalcular investimento no eco do rascunho", () => {
    const draft = parseEscopoJson(saved);
    draft["Cível"][0].investimento!.placeholders!.VALORMENSAL = "2000";
    const sentByChild = stringifyEscopoJsonWithMeta(draft, undefined);
    const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(sentByChild);
    const normalizedByParent = stringifyEscopoJsonWithMeta(escopo,
      resolveInvestimentoDocumento(escopo, ["Cível", "Trabalhista"], investimentoDocumento));
    expect(normalizedByParent).not.toBe(sentByChild);
    expect(isProposalScopeAreaDirty(parseEscopoJson(normalizedByParent), saved, "Cível")).toBe(true);
    expect(isProposalScopeAreaDirty(parseEscopoJson(normalizedByParent), saved, "Trabalhista")).toBe(false);
    const confirmed = applyProposalScopeSave(saved, normalizedByParent);
    expect(isProposalScopeAreaDirty(parseEscopoJson(normalizedByParent), confirmed, "Cível")).toBe(false);
  });

  it("confirma só a área enviada pelo PATCH restrito e preserva outros escopos e metadata salvos", () => {
    const previous = JSON.stringify({ ...JSON.parse(saved), __investimentoDocumento__: { marker: "persisted" } });
    const current = JSON.stringify({
      "Cível": areaEntry("civel-1", "2000"), "Trabalhista": areaEntry("trab-1", "700"),
      __investimentoDocumento__: { marker: "unsaved" },
    });
    const confirmed = applyProposalScopeSave(previous, current, "Cível");
    expect(isProposalScopeAreaDirty(parseEscopoJson(current), confirmed, "Cível")).toBe(false);
    expect(isProposalScopeAreaDirty(parseEscopoJson(current), confirmed, "Trabalhista")).toBe(true);
    expect(JSON.parse(confirmed).__investimentoDocumento__).toEqual({ marker: "persisted" });
  });

  it("confirma o documento inteiro apenas quando não há restrição por área", () => {
    const current = JSON.stringify({ "Cível": areaEntry("civel-1", "2000"), "Trabalhista": areaEntry("trab-1", "700") });
    expect(applyProposalScopeSave(saved, current)).toBe(current);
  });
});
