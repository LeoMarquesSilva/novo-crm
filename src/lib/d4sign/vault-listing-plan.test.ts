import { describe, expect, it } from "vitest";
import {
  formatVaultPageCursor,
  nextVaultListingPage,
  parseVaultPageCursor,
} from "./vault-listing-plan";

describe("parseVaultPageCursor", () => {
  it("começa na página 1", () => {
    expect(parseVaultPageCursor(null)).toBe(1);
    expect(parseVaultPageCursor("")).toBe(1);
    expect(parseVaultPageCursor("done")).toBe(1);
  });

  it("retoma a página gravada", () => {
    expect(parseVaultPageCursor("page=4")).toBe(4);
    expect(formatVaultPageCursor(4)).toBe("page=4");
  });
});

describe("nextVaultListingPage", () => {
  it("avança enquanto o total de páginas for maior", () => {
    expect(nextVaultListingPage(1, { docs: 499, totalPages: 3 })).toEqual({
      nextPage: 2,
      finishedCycle: false,
    });
  });

  it("volta à página 1 quando chega na última", () => {
    expect(nextVaultListingPage(3, { docs: 40, totalPages: 3 })).toEqual({
      nextPage: 1,
      finishedCycle: true,
    });
  });

  it("trata 499 documentos como página cheia quando não há total", () => {
    expect(nextVaultListingPage(2, { docs: 499, totalPages: null })).toEqual({
      nextPage: 3,
      finishedCycle: false,
    });
  });

  it("trata página curta como fim do cofre", () => {
    expect(nextVaultListingPage(1, { docs: 217, totalPages: null })).toEqual({
      nextPage: 1,
      finishedCycle: true,
    });
    expect(nextVaultListingPage(5, { docs: 0, totalPages: null })).toEqual({
      nextPage: 1,
      finishedCycle: true,
    });
  });
});
