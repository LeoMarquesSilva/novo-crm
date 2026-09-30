import { describe, expect, it } from "vitest";
import { CONTRACT_SCOPE_PROFILES } from "./scope-profiles";
import { findSubtypeKeySiblings, summarizeSubtypeClauseCoverage } from "./clause-scope-link";

describe("summarizeSubtypeClauseCoverage", () => {
  const clauses = [
    { area_key: "Cível", scope_subtype_key: "rec_credito_rj", is_active: true },
    { area_key: "Cível", scope_subtype_key: "rec_credito_rj", is_active: false },
    { area_key: "Cível", scope_subtype_key: "outro_subtipo", is_active: true },
    { area_key: "Cível", scope_subtype_key: null, is_active: true },
    { area_key: "Cível", scope_subtype_key: null, is_active: false },
    { area_key: "Trabalhista", scope_subtype_key: null, is_active: true },
    { area_key: null, scope_subtype_key: null, is_active: true },
    { area_key: null, scope_subtype_key: null, is_active: false },
  ];

  it("conta vinculadas ao subtipo (ativas e total), da área e transversais ativas", () => {
    expect(
      summarizeSubtypeClauseCoverage(clauses, { areaKey: "Cível", subtypeKey: "rec_credito_rj" }),
    ).toEqual({
      linked: 2,
      linkedActive: 1,
      areaWideActive: 1,
      transversalActive: 1,
      hasContractProfile: false,
    });
  });

  it("subtipo novo sem cláusulas fica zerado", () => {
    const coverage = summarizeSubtypeClauseCoverage(clauses, { areaKey: "Cível", subtypeKey: "novo" });
    expect(coverage.linked).toBe(0);
    expect(coverage.linkedActive).toBe(0);
  });

  it("reconhece subtipo com perfil de contrato em código", () => {
    const profiled = CONTRACT_SCOPE_PROFILES[0]!.scopeSubtypeId;
    expect(
      summarizeSubtypeClauseCoverage([], { areaKey: "Trabalhista", subtypeKey: profiled })
        .hasContractProfile,
    ).toBe(true);
  });
});

describe("findSubtypeKeySiblings", () => {
  const types = [
    { id: "t1", areaKey: "Cível", label: "Consultivo" },
    { id: "t2", areaKey: "Cível", label: "Ajuizamento" },
  ];
  const subtypes = [
    { id: "s1", scopeTypeId: "t1", subtypeKey: "padrao", label: "Padrão" },
    { id: "s2", scopeTypeId: "t2", subtypeKey: "padrao", label: "Padrão" },
    { id: "s3", scopeTypeId: "t2", subtypeKey: "unico", label: "Único" },
  ];

  it("lista outros subtipos com a mesma chave, com tipo e área", () => {
    expect(findSubtypeKeySiblings(subtypes, types, "s1")).toEqual([
      { id: "s2", label: "Padrão", typeLabel: "Ajuizamento", areaKey: "Cível" },
    ]);
  });

  it("retorna vazio para chave única ou id desconhecido", () => {
    expect(findSubtypeKeySiblings(subtypes, types, "s3")).toEqual([]);
    expect(findSubtypeKeySiblings(subtypes, types, "nope")).toEqual([]);
  });
});
