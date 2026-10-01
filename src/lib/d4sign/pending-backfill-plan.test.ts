import { describe, expect, it } from "vitest";
import {
  advancePendingCursor,
  documentBelongsToSafe,
  formatPendingCursor,
  mapPendingStatusId,
  parsePendingCursor,
} from "./pending-backfill-plan";

describe("parsePendingCursor", () => {
  it("começa na fase 3, página 1", () => {
    expect(parsePendingCursor(null)).toEqual({ phase: 3, page: 1 });
    expect(parsePendingCursor("done")).toBe("done");
  });

  it("retoma a página gravada", () => {
    expect(parsePendingCursor("phase=3;page=4")).toEqual({ phase: 3, page: 4 });
    expect(parsePendingCursor("phase=2;page=1")).toEqual({ phase: 2, page: 1 });
    expect(parsePendingCursor("phase=4;page=2")).toEqual({ phase: 4, page: 2 });
    expect(parsePendingCursor("phase=9;page=2")).toEqual({ phase: 3, page: 1 });
  });
});

describe("advancePendingCursor", () => {
  it("segue a página enquanto o total informado for maior", () => {
    expect(
      advancePendingCursor({ phase: 3, page: 1 }, { docs: 500, totalPages: 3 }),
    ).toEqual({ phase: 3, page: 2 });
  });

  it("passa para a fase 2 quando a fase 3 acaba", () => {
    expect(
      advancePendingCursor({ phase: 3, page: 2 }, { docs: 40, totalPages: 2 }),
    ).toEqual({ phase: 2, page: 1 });
  });

  it("depois dos pendentes lista finalizados e as demais fases", () => {
    expect(
      advancePendingCursor({ phase: 2, page: 1 }, { docs: 12, totalPages: 1 }),
    ).toEqual({ phase: 4, page: 1 });
    expect(
      advancePendingCursor({ phase: 4, page: 1 }, { docs: 12, totalPages: 1 }),
    ).toEqual({ phase: 1, page: 1 });
  });

  it("encerra o ciclo depois da última fase", () => {
    expect(
      advancePendingCursor({ phase: 7, page: 1 }, { docs: 0, totalPages: 1 }),
    ).toBe("done");
    expect(formatPendingCursor("done")).toBe("done");
  });

  it("trata página quase cheia como incompleta quando não há total", () => {
    expect(
      advancePendingCursor({ phase: 3, page: 1 }, { docs: 499, totalPages: null }),
    ).toEqual({ phase: 3, page: 2 });
  });
});

describe("mapPendingStatusId", () => {
  it("mapeia aguardando assinaturas para o status interno", () => {
    expect(mapPendingStatusId("3")).toBe("3");
    expect(mapPendingStatusId(2)).toBe("sent");
  });
});

describe("documentBelongsToSafe", () => {
  it("aceita o cofre configurado e documento sem cofre", () => {
    expect(documentBelongsToSafe("ABC", "abc")).toBe(true);
    expect(documentBelongsToSafe(undefined, "abc")).toBe(true);
    expect(documentBelongsToSafe("outro", "abc")).toBe(false);
  });
});
