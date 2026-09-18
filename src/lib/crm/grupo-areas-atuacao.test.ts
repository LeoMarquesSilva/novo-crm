import { describe, expect, it } from "vitest";
import {
  deriveGrupoAreasFromSignals,
  mergeGrupoPracticeAreas,
  mergeSelectedGrupoAreas,
  parseAreasAtuacao,
  prefillGrupoAreaKeys,
} from "./grupo-areas-atuacao";

describe("deriveGrupoAreasFromSignals", () => {
  it("une rateio de honorários e pastas ativas, sem inventar área", () => {
    const derived = deriveGrupoAreasFromSignals({
      rateioDepartamentos: ["Contratos", "Cível", "Financeiro", "Cível | Insolvência"],
      pastaAreas: ["Trabalhista"],
      pastaDepartamentos: ["Trabalhista", "Insolvência"],
    });
    expect(derived).toEqual([
      { areaKey: "Cível", sources: ["rateio"] },
      { areaKey: "Trabalhista", sources: ["pasta"] },
      { areaKey: "Societário e Contratos", sources: ["rateio"] },
      { areaKey: "Reestruturação e Insolvência", sources: ["pasta"] },
    ]);
  });

  it("marca Pague Menos só em Trabalhista quando as 850 pastas ativas são trabalhistas", () => {
    const derived = deriveGrupoAreasFromSignals({
      rateioDepartamentos: [],
      pastaAreas: Array.from({ length: 850 }, () => "Trabalhista"),
      pastaDepartamentos: Array.from({ length: 850 }, () => "Trabalhista"),
    });
    expect(derived).toEqual([{ areaKey: "Trabalhista", sources: ["pasta"] }]);
  });

  it("acumula rateio e pasta na mesma área", () => {
    const derived = deriveGrupoAreasFromSignals({
      rateioDepartamentos: ["Trabalhista"],
      pastaAreas: ["Trabalhista"],
      pastaDepartamentos: ["Trabalhista"],
    });
    expect(derived).toEqual([{ areaKey: "Trabalhista", sources: ["rateio", "pasta"] }]);
  });
});

describe("mergeSelectedGrupoAreas", () => {
  it("manual só entra quando não há rateio nem pasta ativa", () => {
    const derived = deriveGrupoAreasFromSignals({
      rateioDepartamentos: ["Tributário"],
      pastaAreas: ["Trabalhista"],
      pastaDepartamentos: [],
    });
    expect(
      mergeSelectedGrupoAreas({
        selectedAreaKeys: ["Tributário", "Trabalhista", "Cível"],
        derived,
      }),
    ).toEqual([
      { areaKey: "Cível", sources: ["manual"] },
      { areaKey: "Trabalhista", sources: ["pasta"] },
      { areaKey: "Tributário", sources: ["rateio"] },
    ]);
  });
});

describe("prefillGrupoAreaKeys", () => {
  it("pré-marca derivadas e mantém manuais já gravadas", () => {
    expect(
      prefillGrupoAreaKeys({
        derived: [{ areaKey: "Trabalhista", sources: ["pasta"] }],
        saved: [{ areaKey: "Cível", sources: ["manual"] }],
      }),
    ).toEqual(["Cível", "Trabalhista"]);
  });
});

describe("mergeGrupoPracticeAreas", () => {
  it("une responsible_area do OrquestrAI com áreas SIOE e não chama isso de Categoria", () => {
    expect(
      mergeGrupoPracticeAreas({
        responsibleArea: "Cível",
        areasAtuacao: [{ areaKey: "Trabalhista", sources: ["pasta"] }],
      }),
    ).toEqual(["Cível", "Trabalhista"]);
  });

  it("mapeia legal_areas do OrquestrAI (Reestruturação, Recuperação de Crédito) para as chaves canónicas", () => {
    expect(
      mergeGrupoPracticeAreas({
        responsibleArea: "Reestruturação",
        legalAreas: ["Cível", "Reestruturação", "Operações Legais", "Recuperação de Crédito"],
      }),
    ).toEqual(["Cível", "Recuperação de Créditos", "Reestruturação e Insolvência"]);
  });
});

describe("parseAreasAtuacao", () => {
  it("ignora chaves fora das áreas canónicas", () => {
    expect(
      parseAreasAtuacao([
        { areaKey: "Trabalhista", sources: ["pasta", "inventado"] },
        { areaKey: "Financeiro", sources: ["manual"] },
      ]),
    ).toEqual([{ areaKey: "Trabalhista", sources: ["pasta"] }]);
  });
});
