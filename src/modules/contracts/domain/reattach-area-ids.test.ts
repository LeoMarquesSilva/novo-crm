import { describe, expect, it } from "vitest";

import {
  bindOrphanedAreaIdsToSingleArea,
  reattachAreaId,
  reattachOptionalAreaIds,
  reattachRequiredAreaIds,
} from "./reattach-area-ids";

const previous = [{ id: "old-trab", areaKey: "Trabalhista" }];
const next = [{ id: "new-trab", areaKey: "Trabalhista" }];

describe("reattachAreaId", () => {
  it("mantém o id quando a área ainda existe", () => {
    expect(reattachAreaId("new-trab", previous, next)).toBe("new-trab");
  });

  it("recasa pelo areaKey quando a linha foi recriada", () => {
    expect(reattachAreaId("old-trab", previous, next)).toBe("new-trab");
  });

  it("usa a única área restante se o id antigo não tiver chave", () => {
    expect(reattachAreaId("ghost", [], next)).toBe("new-trab");
  });
});

describe("reattachOptionalAreaIds", () => {
  it("remove área órfã quando há várias áreas e nenhuma chave casa", () => {
    const result = reattachOptionalAreaIds(
      [{ id: "c1", areaId: "ghost" }],
      previous,
      [
        { id: "a", areaKey: "Cível" },
        { id: "b", areaKey: "Trabalhista" },
      ],
    );
    expect(result[0]).toEqual({ id: "c1" });
  });
});

describe("reattachRequiredAreaIds", () => {
  it("atualiza rateio para o novo id da mesma área", () => {
    expect(
      reattachRequiredAreaIds([{ id: "r1", areaId: "old-trab" }], previous, next),
    ).toEqual([{ id: "r1", areaId: "new-trab" }]);
  });
});

describe("bindOrphanedAreaIdsToSingleArea", () => {
  it("religa componentes e rateios órfãos quando o contrato tem uma só área", () => {
    const bound = bindOrphanedAreaIdsToSingleArea({
      areas: [{ id: "new-trab", areaKey: "Trabalhista" }],
      version: {
        components: [
          { areaId: "old-trab" },
          { areaId: "old-hora" },
          { areaId: "new-trab" },
        ],
        areaAllocations: [{ areaId: "old-trab" }],
      },
    });
    expect(bound.version.components.map((component) => component.areaId)).toEqual([
      "new-trab",
      "new-trab",
      "new-trab",
    ]);
    expect(bound.version.areaAllocations[0]?.areaId).toBe("new-trab");
  });

  it("não inventa área quando há mais de uma", () => {
    const input = {
      areas: [
        { id: "a", areaKey: "Cível" },
        { id: "b", areaKey: "Trabalhista" },
      ],
      version: {
        components: [{ areaId: "ghost" }],
        areaAllocations: [{ areaId: "ghost" }],
      },
    };
    expect(bindOrphanedAreaIdsToSingleArea(input)).toBe(input);
  });
});
