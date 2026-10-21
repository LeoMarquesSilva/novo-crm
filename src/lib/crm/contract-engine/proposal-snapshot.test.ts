import { describe, expect, it } from "vitest";
import {
  resolveContractScopes,
  scopeSubtypeLabelKey,
  scopeSubtypeLabelsFromCatalog,
} from "./proposal-snapshot";

const AREA = "Recuperação de Créditos";
const SUBTIPO = "recuperacao_de_credito_em_processos_de_recuperacao_judicial";

const escopoJson = JSON.stringify({
  [AREA]: [{ id: "e-rj", tipoId: "recuperacao_credito", subtipoId: SUBTIPO, placeholders: {} }],
});

describe("rótulo do subtipo de escopo no contrato", () => {
  it("usa o rótulo do catálogo do banco para subtipo que o catálogo do código não tem", () => {
    const labels = scopeSubtypeLabelsFromCatalog({
      [AREA]: [
        {
          tipoId: "recuperacao_credito",
          label: "Recuperação de crédito",
          subtipos: [
            {
              subtipoId: SUBTIPO,
              label: "Recuperação de Crédito em Processos de Recuperação Judicial",
              escopoTemplate: "",
            },
          ],
        },
      ],
    });

    expect(labels[scopeSubtypeLabelKey(AREA, "recuperacao_credito", SUBTIPO)]).toBe(
      "Recuperação de Crédito em Processos de Recuperação Judicial",
    );
    const [scope] = resolveContractScopes(escopoJson, labels);
    expect(scope.label).toBe("Recuperação de Crédito em Processos de Recuperação Judicial");
    expect(scope.missingProfile).toBe(true);
  });

  it("sem o catálogo do banco, ainda monta um rótulo a partir da chave", () => {
    const [scope] = resolveContractScopes(escopoJson);
    expect(scope.label).toBe("Recuperacao de Credito Em Processos de Recuperacao Judicial");
  });
});
