import { describe, expect, it } from "vitest";
import {
  applyGrupoIntakeGridSaves,
  filterGrupoIntakeGridRows,
  listGrupoIntakeGridRows,
  prepareGrupoIntakeRowSave,
  type GrupoIntakeGridRow,
} from "./grupo-intake-grid";

const now = "2026-09-18T18:00:00.000Z";

const rows: GrupoIntakeGridRow[] = [
  {
    id: "g-ativo",
    nome: "Pague Menos",
    clienteStatus: "ativo",
    alreadyFilled: false,
    indication: null,
    derivedAreas: [{ areaKey: "Trabalhista", sources: ["pasta"] }],
    prefilledAreaKeys: ["Trabalhista"],
  },
  {
    id: "g-inativo",
    nome: "Acme Antiga",
    clienteStatus: "inativo",
    alreadyFilled: true,
    indication: { tipoLead: "Lead Digital", tipoIndicacao: null, nomeIndicacao: null },
    derivedAreas: [],
    prefilledAreaKeys: [],
  },
  {
    id: "g-sem-status",
    nome: "Beta Holding",
    clienteStatus: null,
    alreadyFilled: false,
    indication: null,
    derivedAreas: [],
    prefilledAreaKeys: [],
  },
];

describe("grade pública de preenchimento", () => {
  it("filtra por busca e prioriza Cliente ativo, com opção de ver inativos", () => {
    expect(filterGrupoIntakeGridRows(rows).map((row) => row.id)).toEqual(["g-ativo"]);
    expect(filterGrupoIntakeGridRows(rows, { status: "inativos" }).map((row) => row.id)).toEqual([
      "g-inativo",
    ]);
    expect(filterGrupoIntakeGridRows(rows, { status: "todos", query: "beta" }).map((row) => row.id)).toEqual([
      "g-sem-status",
    ]);
    expect(listGrupoIntakeGridRows(rows, { status: "todos" }).map((row) => row.nome)).toEqual([
      "Acme Antiga",
      "Beta Holding",
      "Pague Menos",
    ]);
  });

  it("grava várias linhas do mesmo token sem misturar os grupos", () => {
    const first = prepareGrupoIntakeRowSave({
      now,
      derived: [{ areaKey: "Trabalhista", sources: ["pasta"] }],
      draft: {
        grupoId: "g-ativo",
        tipoLead: "Indicacao",
        tipoIndicacao: "Consultor",
        nomeIndicacao: " Felipe da Triunfae ",
        selectedAreaKeys: ["Trabalhista", "Cível"],
      },
    });
    const second = prepareGrupoIntakeRowSave({
      now: "2026-09-18T18:01:00.000Z",
      previousFilledAt: "2026-09-01T00:00:00.000Z",
      derived: [],
      draft: {
        grupoId: "g-inativo",
        tipoLead: "Lead Ativa",
        selectedAreaKeys: ["Tributário"],
      },
    });
    const invalid = prepareGrupoIntakeRowSave({
      now,
      derived: [],
      draft: {
        grupoId: "g-sem-status",
        tipoLead: "Indicacao",
        selectedAreaKeys: [],
      },
    });

    const applied = applyGrupoIntakeGridSaves({}, [first, second, invalid]);
    expect(applied.savedIds).toEqual(["g-ativo", "g-inativo"]);
    expect(applied.errors).toEqual(["Tipo de indicação é obrigatório para origem Indicação."]);
    expect(applied.store["g-ativo"]).toMatchObject({
      id: "g-ativo",
      tipoLead: "Indicacao",
      tipoIndicacao: "Consultor",
      nomeIndicacao: "Felipe da Triunfae",
      intakeFilledAt: now,
      areas: [
        { areaKey: "Cível", sources: ["manual"] },
        { areaKey: "Trabalhista", sources: ["pasta"] },
      ],
    });
    expect(applied.store["g-inativo"]).toMatchObject({
      id: "g-inativo",
      tipoLead: "Lead Ativa",
      tipoIndicacao: null,
      nomeIndicacao: null,
      intakeFilledAt: "2026-09-01T00:00:00.000Z",
      areas: [{ areaKey: "Tributário", sources: ["manual"] }],
    });
    expect(applied.store["g-sem-status"]).toBeUndefined();
  });

  it("atualiza de novo a mesma linha sem apagar as outras", () => {
    const initial = applyGrupoIntakeGridSaves({}, [
      prepareGrupoIntakeRowSave({
        now,
        derived: [],
        draft: { grupoId: "g-ativo", tipoLead: "Lead Digital", selectedAreaKeys: ["Cível"] },
      }),
      prepareGrupoIntakeRowSave({
        now,
        derived: [],
        draft: { grupoId: "g-inativo", tipoLead: "Lead Ativa", selectedAreaKeys: ["Tributário"] },
      }),
    ]);

    const updated = applyGrupoIntakeGridSaves(initial.store, [
      prepareGrupoIntakeRowSave({
        now: "2026-09-18T19:00:00.000Z",
        previousFilledAt: now,
        derived: [],
        draft: { grupoId: "g-ativo", tipoLead: "Lead Passiva", selectedAreaKeys: ["Cível", "Trabalhista"] },
      }),
    ]);

    expect(updated.store["g-ativo"].tipoLead).toBe("Lead Passiva");
    expect(updated.store["g-ativo"].areas.map((area) => area.areaKey)).toEqual(["Cível", "Trabalhista"]);
    expect(updated.store["g-inativo"].tipoLead).toBe("Lead Ativa");
    expect(updated.store["g-inativo"].areas).toEqual([{ areaKey: "Tributário", sources: ["manual"] }]);
  });
});
