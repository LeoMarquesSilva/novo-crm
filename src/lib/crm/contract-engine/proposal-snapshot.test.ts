import { describe, expect, it } from "vitest";
import {
  resolveContractingParties,
  resolveContractScopes,
  scopeSubtypeLabelKey,
  scopeSubtypeLabelsFromCatalog,
} from "./proposal-snapshot";

describe("partes do contrato com duas pessoas no cadastro", () => {
  const empresasIntake = [
    { index: 1, razao_social: "VINICIUS", tipo_documento: "CPF" as const, documento: "111.444.777-35" },
    { index: 2, razao_social: "ANDRE", tipo_documento: "CPF" as const, documento: "123.456.789-09" },
  ];
  const address = { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "" };
  const roles = (propostaEmpresasJson: string) =>
    resolveContractingParties({ empresasIntake, propostaEmpresasJson, address }).map((p) => [p.razaoSocial, p.role]);

  it("a lista de contratantes põe a 2ª pessoa no contrato", () => {
    expect(roles(JSON.stringify({ primaryIndex: 1, extras: [], contratantes: [2] }))).toEqual([
      ["VINICIUS", "contratante"],
      ["ANDRE", "contratante"],
    ]);
  });

  it("escolha antiga, sem a lista, mantém a regra anterior", () => {
    expect(roles(JSON.stringify({ primaryIndex: 1, extras: [] }))).toEqual([
      ["VINICIUS", "contratante"],
      ["ANDRE", "relacionada"],
    ]);
  });
});

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
