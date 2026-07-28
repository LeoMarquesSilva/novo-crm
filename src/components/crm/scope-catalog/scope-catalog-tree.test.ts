import { describe, expect, it } from "vitest";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import {
  buildInvestmentTree,
  buildScopeTree,
  filterScopeTree,
  findCreatedId,
  selectionStillValid,
  type ScopeTreeGroup,
} from "./scope-catalog-tree";

function catalogFixture(
  adminRows: Partial<ProposalCatalogAdminData["adminRows"]> = {},
): ProposalCatalogAdminData {
  return {
    scope: {} as ProposalCatalogAdminData["scope"],
    investment: [],
    source: "database",
    scopeTypeCount: 0,
    scopeSubtypeCount: 0,
    investmentTypeCount: 0,
    investmentSubtypeCount: 0,
    adminRows: {
      scopeTypes: [],
      scopeSubtypes: [],
      investmentTypes: [],
      investmentSubtypes: [],
      ...adminRows,
    },
  };
}

describe("buildScopeTree", () => {
  it("agrupa por areaKey e ordena tipos e subtipos", () => {
    const data = catalogFixture({
      scopeTypes: [
        {
          id: "t-b",
          areaKey: "Contencioso",
          typeKey: "b",
          label: "Tipo B",
          sortOrder: 2,
          isActive: true,
        },
        {
          id: "t-a",
          areaKey: "Due Diligence",
          typeKey: "a",
          label: "Tipo A",
          sortOrder: 1,
          isActive: true,
        },
        {
          id: "t-c",
          areaKey: "Contencioso",
          typeKey: "c",
          label: "Tipo C",
          sortOrder: 1,
          isActive: false,
        },
      ],
      scopeSubtypes: [
        {
          id: "s-2",
          scopeTypeId: "t-c",
          subtypeKey: "s2",
          label: "Sub Z",
          escopoTemplate: "",
          placeholderKeys: [],
          sortOrder: 2,
          isActive: true,
        },
        {
          id: "s-1",
          scopeTypeId: "t-c",
          subtypeKey: "s1",
          label: "Sub A",
          escopoTemplate: "",
          placeholderKeys: [],
          sortOrder: 1,
          isActive: true,
        },
      ],
    });

    const groups = buildScopeTree(data);

    expect(groups.map((g) => g.label)).toEqual(["Contencioso", "Due Diligence"]);
    const contencioso = groups.find((g) => g.key === "Contencioso")!;
    expect(contencioso.items.map((i) => i.key)).toEqual(["t-c", "t-b"]);
    expect(contencioso.items[0]!.subtypes.map((s) => s.key)).toEqual(["s-1", "s-2"]);
    expect(contencioso.items[0]!.subtypes[0]!.parentBreadcrumb).toEqual([
      "Contencioso",
      "Tipo C",
    ]);
  });

  it("ignora subtipo órfão quando o tipo pai não existe", () => {
    const data = catalogFixture({
      scopeTypes: [
        {
          id: "t-1",
          areaKey: "Due Diligence",
          typeKey: "a",
          label: "Tipo",
          sortOrder: 1,
          isActive: true,
        },
      ],
      scopeSubtypes: [
        {
          id: "s-orphan",
          scopeTypeId: "missing",
          subtypeKey: "x",
          label: "Órfão",
          escopoTemplate: "",
          placeholderKeys: [],
          sortOrder: 1,
          isActive: true,
        },
      ],
    });

    expect(buildScopeTree(data)[0]!.items[0]!.subtypes).toEqual([]);
  });
});

describe("buildInvestmentTree", () => {
  it("retorna um grupo com hideLabel e tipos ordenados", () => {
    const data = catalogFixture({
      investmentTypes: [
        {
          id: "it-2",
          typeKey: "b",
          label: "Investimento B",
          sortOrder: 2,
          isActive: true,
        },
        {
          id: "it-1",
          typeKey: "a",
          label: "Investimento A",
          sortOrder: 1,
          isActive: true,
        },
      ],
      investmentSubtypes: [
        {
          id: "is-1",
          investmentTypeId: "it-2",
          subtypeKey: "s1",
          label: "Parcela única",
          conceito: "",
          template: "",
          placeholderKeys: [],
          sortOrder: 1,
          isActive: true,
        },
      ],
    });

    const groups = buildInvestmentTree(data);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "__investments__",
      label: "",
      hideLabel: true,
    });
    expect(groups[0]!.items.map((i) => i.key)).toEqual(["it-1", "it-2"]);
    expect(groups[0]!.items[1]!.subtypes[0]!.parentBreadcrumb).toEqual(["Investimento B"]);
  });
});

describe("filterScopeTree", () => {
  const groups: ScopeTreeGroup[] = [
    {
      key: "Due Diligence",
      label: "Due Diligence",
      items: [
        {
          key: "type-1",
          label: "Auditoria",
          isActive: true,
          sortOrder: 1,
          subtypes: [
            {
              key: "sub-1",
              label: "Financeira",
              isActive: true,
              sortOrder: 1,
              parentBreadcrumb: ["Due Diligence", "Auditoria"],
            },
            {
              key: "sub-2",
              label: "Trabalhista",
              isActive: true,
              sortOrder: 2,
              parentBreadcrumb: ["Due Diligence", "Auditoria"],
            },
          ],
        },
        {
          key: "type-2",
          label: "Consultoria",
          isActive: true,
          sortOrder: 2,
          subtypes: [],
        },
      ],
    },
  ];

  it("retorna grupos intactos quando query vazia", () => {
    expect(filterScopeTree(groups, "")).toEqual(groups);
    expect(filterScopeTree(groups, "   ")).toEqual(groups);
  });

  it("mantém ancestrais quando subtipo corresponde", () => {
    const filtered = filterScopeTree(groups, "financeira");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.label).toBe("Due Diligence");
    expect(filtered[0]!.items).toHaveLength(1);
    expect(filtered[0]!.items[0]!.label).toBe("Auditoria");
    expect(filtered[0]!.items[0]!.subtypes.map((s) => s.key)).toEqual(["sub-1"]);
  });

  it("inclui todos os subtipos quando o tipo corresponde", () => {
    const filtered = filterScopeTree(groups, "auditoria");

    expect(filtered[0]!.items[0]!.subtypes).toHaveLength(2);
  });
});

describe("selectionStillValid", () => {
  const data = catalogFixture({
    scopeTypes: [
      {
        id: "t-1",
        areaKey: "Due Diligence",
        typeKey: "a",
        label: "Tipo",
        sortOrder: 1,
        isActive: true,
      },
    ],
    scopeSubtypes: [
      {
        id: "s-1",
        scopeTypeId: "t-1",
        subtypeKey: "s1",
        label: "Sub",
        escopoTemplate: "",
        placeholderKeys: [],
        sortOrder: 1,
        isActive: true,
      },
    ],
    investmentTypes: [
      {
        id: "it-1",
        typeKey: "inv",
        label: "Inv",
        sortOrder: 1,
        isActive: true,
      },
    ],
    investmentSubtypes: [
      {
        id: "is-1",
        investmentTypeId: "it-1",
        subtypeKey: "is1",
        label: "Inv Sub",
        conceito: "",
        template: "",
        placeholderKeys: [],
        sortOrder: 1,
        isActive: true,
      },
    ],
  });

  it("retorna true para seleção nula", () => {
    expect(selectionStillValid(null, data, "scope")).toBe(true);
  });

  it("retorna true quando tipo ou subtipo ainda existem", () => {
    expect(selectionStillValid({ level: "type", typeId: "t-1" }, data, "scope")).toBe(true);
    expect(
      selectionStillValid({ level: "subtype", subtypeId: "s-1" }, data, "scope"),
    ).toBe(true);
    expect(
      selectionStillValid({ level: "subtype", subtypeId: "is-1" }, data, "investment"),
    ).toBe(true);
  });

  it("retorna false quando subtipo foi removido dos dados", () => {
    const withoutSubtype = catalogFixture({
      ...data.adminRows,
      scopeSubtypes: [],
    });

    expect(
      selectionStillValid({ level: "subtype", subtypeId: "s-1" }, withoutSubtype, "scope"),
    ).toBe(false);
  });

  it("retorna false quando tipo foi removido dos dados", () => {
    expect(selectionStillValid({ level: "type", typeId: "t-missing" }, data, "scope")).toBe(
      false,
    );
  });
});

describe("findCreatedId", () => {
  it("detecta novo tipo de escopo", () => {
    const prev = catalogFixture({
      scopeTypes: [
        {
          id: "t-1",
          areaKey: "Cível",
          typeKey: "a",
          label: "Tipo A",
          sortOrder: 1,
          isActive: true,
        },
      ],
    });
    const next = catalogFixture({
      scopeTypes: [
        ...prev.adminRows.scopeTypes,
        {
          id: "t-new",
          areaKey: "Trabalhista",
          typeKey: "b",
          label: "Tipo B",
          sortOrder: 2,
          isActive: true,
        },
      ],
    });

    expect(findCreatedId(prev, next, { type: "scope_type" })).toBe("t-new");
  });

  it("detecta novo subtipo de escopo no tipo pai", () => {
    const prev = catalogFixture({
      scopeTypes: [
        {
          id: "t-1",
          areaKey: "Cível",
          typeKey: "a",
          label: "Tipo",
          sortOrder: 1,
          isActive: true,
        },
      ],
      scopeSubtypes: [
        {
          id: "s-1",
          scopeTypeId: "t-1",
          subtypeKey: "s1",
          label: "Sub A",
          escopoTemplate: "",
          placeholderKeys: [],
          sortOrder: 1,
          isActive: true,
        },
      ],
    });
    const next = catalogFixture({
      ...prev.adminRows,
      scopeSubtypes: [
        ...prev.adminRows.scopeSubtypes,
        {
          id: "s-new",
          scopeTypeId: "t-1",
          subtypeKey: "s2",
          label: "Sub B",
          escopoTemplate: "",
          placeholderKeys: [],
          sortOrder: 2,
          isActive: true,
        },
      ],
    });

    expect(findCreatedId(prev, next, { type: "scope_subtype", scopeTypeId: "t-1" })).toBe("s-new");
  });

  it("detecta novo tipo de investimento", () => {
    const prev = catalogFixture();
    const next = catalogFixture({
      investmentTypes: [
        {
          id: "it-new",
          typeKey: "x",
          label: "Novo",
          sortOrder: 1,
          isActive: true,
        },
      ],
    });

    expect(findCreatedId(prev, next, { type: "investment_type" })).toBe("it-new");
  });

  it("retorna null quando nada foi adicionado", () => {
    const data = catalogFixture({
      scopeTypes: [
        {
          id: "t-1",
          areaKey: "Cível",
          typeKey: "a",
          label: "Tipo",
          sortOrder: 1,
          isActive: true,
        },
      ],
    });

    expect(findCreatedId(data, data, { type: "scope_type" })).toBeNull();
  });
});
