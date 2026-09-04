// @vitest-environment jsdom
import { useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ObjetoContratoSection } from "./contrato-object-panels";
import type {
  CanonicalContractBuildResult,
  CanonicalContractObject,
  ContractObjectFieldValue,
  ContractScope,
} from "@/lib/crm/contract-engine/types";

const REQUIRED_EMPTY_PLACEHOLDER = "Campo necessário para gerar o Objeto do Contrato.";

const DEMO_SCOPE: ContractScope = {
  entryId: "scope-1",
  areaLabel: "Cível",
  typeId: "contencioso",
  subtypeId: "mais_um_processo",
  label: "Mais de um processo",
  placeholders: {},
  profile: null,
  missingProfile: false,
};

/** Monta um `CanonicalContractBuildResult` mínimo — só o suficiente pra `ObjetoContratoSection`
 * renderizar de verdade. Os campos de `CanonicalContractData` fora de `contractObject`/`scopes`
 * não são lidos pelo componente sob teste, então ficam com valores neutros. */
function fixtureBuild(fieldValues: ContractObjectFieldValue[]): CanonicalContractBuildResult {
  const contractObject: CanonicalContractObject = {
    blocks: [],
    numberedLines: [
      {
        number: "1",
        title: "Objeto do Contrato",
        content: "Texto de demonstração do objeto.",
        kind: "paragraph",
        stableKey: "object.demo",
        sourceLabel: "Perfil demo",
        version: 1,
      },
    ],
    representedScopeIds: [DEMO_SCOPE.entryId],
    missingScopeIds: [],
    unexpectedScopeIds: [],
    status: "incomplete",
    missingRequiredFields: fieldValues.filter((f) => f.required && !f.value.trim()).map((f) => f.key),
    fieldValues,
    overrides: [],
    compositionKey: null,
  };

  return {
    data: {
      opportunityId: "op-1",
      proposalSnapshotId: "snap-1",
      contractingParties: [],
      contractedFirm: {} as CanonicalContractBuildResult["data"]["contractedFirm"],
      scopes: [DEMO_SCOPE],
      investment: { items: [], totalAmount: null, totalExtenso: "", tributacao: "" },
      payment: {
        method: "indefinido",
        clauseText: "",
        firstDueDate: null,
        installmentCount: null,
        downPayment: null,
        arithmeticOk: true,
        arithmeticNote: null,
      },
      term: {} as CanonicalContractBuildResult["data"]["term"],
      startRule: {} as CanonicalContractBuildResult["data"]["startRule"],
      clauses: [],
      sections: [],
      signers: [],
      generation: { city: "", generatedAt: "", localDateLabel: "" },
      overrides: [],
      contractObject,
      scopeAdjustment: null,
      engineEvents: [],
    },
    alignment: { ok: true, blockers: [], warnings: [] },
    pendencias: [],
  };
}

/** Reproduz o round-trip real do builder: o pai guarda `fieldValues` em estado e
 * recalcula `build` a cada digitação — exatamente como `ContratoBuilderDialog`
 * recalcula `liveBuild` a partir de `objectFields` a cada tecla. */
function ObjetoContratoHarness({ initialFieldValues }: { initialFieldValues: ContractObjectFieldValue[] }) {
  const [fieldValues, setFieldValues] = useState(initialFieldValues);
  const build = useMemo(() => fixtureBuild(fieldValues), [fieldValues]);
  return (
    <ObjetoContratoSection
      num={1}
      build={build}
      onFieldChange={(key, value) =>
        setFieldValues((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)))
      }
      onOverride={() => undefined}
    />
  );
}

describe("ObjetoContratoSection — campo obrigatório digitado ao vivo", () => {
  it("não desmonta nem perde o foco do input ao passar de vazio para preenchido", () => {
    // Regressão: antes da correção, campos obrigatórios ficavam numa lista "faltando"
    // separada da lista "já preenchidos" — ao digitar o 1º caractere, o campo mudava
    // de container (duas árvores de .map() diferentes), o que fazia o React desmontar
    // o <input> de um lado e remontar do outro, tirando o foco/cursor do usuário no
    // meio da digitação. Agora os campos ficam numa lista única e estável.
    render(
      <ObjetoContratoHarness
        initialFieldValues={[
          { key: "qtd_horas_societario", label: "Quantidade de horas mensais", value: "", required: true, source: "unresolved", scopeEntryId: "scope-1" },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText(REQUIRED_EMPTY_PLACEHOLDER);
    input.focus();
    expect(document.activeElement).toBe(input);

    // Digita caractere a caractere, conferindo a cada passo que é SEMPRE o mesmo nó DOM
    // (nunca um <input> novo) e que o foco nunca sai dele.
    let typed = "";
    for (const char of "12345") {
      typed += char;
      fireEvent.change(input, { target: { value: typed } });
      expect(document.activeElement).toBe(input);
      expect(screen.getByDisplayValue(typed)).toBe(input);
    }

    expect(input).toHaveValue("12345");
  });

  it("mantém o valor de campos já preenchidos visível junto aos que faltam, sem duplicar", () => {
    render(
      <ObjetoContratoHarness
        initialFieldValues={[
          { key: "numero_processo_civel", label: "Número do processo", value: "", required: true, source: "unresolved", scopeEntryId: "scope-1" },
          { key: "vara_tribunal_civel", label: "Vara / Tribunal", value: "1ª Vara Cível", required: true, source: "manual", scopeEntryId: "scope-1" },
        ]}
      />,
    );

    expect(screen.getByText(/Faltam 1 informação/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("1ª Vara Cível")).toBeInTheDocument();
    expect(screen.getAllByText("Número do processo").length).toBe(1);
    expect(screen.getAllByText("Vara / Tribunal").length).toBe(1);
  });
});
