import { describe, expect, it } from "vitest";
import { isIsoTimestamp, timestampsMatch } from "./timestamps";

describe("timestampsMatch", () => {
  it("iguala o timestamptz do Postgres com o ISO truncado do RSC", () => {
    expect(
      timestampsMatch("2026-09-30T18:38:12.519768+00:00", "2026-09-30T18:38:12.519Z"),
    ).toBe(true);
  });

  it("iguala offset zero e sufixo Z", () => {
    expect(timestampsMatch("2026-09-30T18:38:12+00:00", "2026-09-30T18:38:12.000Z")).toBe(true);
  });

  it("rejeita instantes com mais de um segundo de diferença", () => {
    expect(timestampsMatch("2026-09-30T18:38:12.000Z", "2026-09-30T18:38:14.000Z")).toBe(false);
  });
});

describe("isIsoTimestamp", () => {
  it("aceita microssegundos do Postgres", () => {
    expect(isIsoTimestamp("2026-09-30T18:38:12.519768+00:00")).toBe(true);
  });
});
