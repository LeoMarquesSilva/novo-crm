import { describe, expect, it } from "vitest";
import {
  isEmptyOrInvalidDateBrStoredValue,
  isValidIsoDateString,
} from "./date-br";

describe("isValidIsoDateString", () => {
  it("accepts valid civil dates", () => {
    expect(isValidIsoDateString("2026-04-15")).toBe(true);
    expect(isValidIsoDateString("2024-02-29")).toBe(true);
  });

  it("rejects invalid calendar dates", () => {
    expect(isValidIsoDateString("2025-02-29")).toBe(false);
    expect(isValidIsoDateString("2026-13-01")).toBe(false);
    expect(isValidIsoDateString("2026-04-31")).toBe(false);
  });

  it("rejects wrong shape", () => {
    expect(isValidIsoDateString("")).toBe(false);
    expect(isValidIsoDateString("15/04/2026")).toBe(false);
    expect(isValidIsoDateString("2026-4-5")).toBe(false);
  });
});

describe("isEmptyOrInvalidDateBrStoredValue", () => {
  it("treats undefined, empty and invalid as empty", () => {
    expect(isEmptyOrInvalidDateBrStoredValue(undefined)).toBe(true);
    expect(isEmptyOrInvalidDateBrStoredValue("")).toBe(true);
    expect(isEmptyOrInvalidDateBrStoredValue("  ")).toBe(true);
    expect(isEmptyOrInvalidDateBrStoredValue("not-a-date")).toBe(true);
    expect(isEmptyOrInvalidDateBrStoredValue("2025-02-29")).toBe(true);
  });

  it("accepts valid ISO date strings", () => {
    expect(isEmptyOrInvalidDateBrStoredValue("2026-01-01")).toBe(false);
  });

  it("treats arrays as empty for blocking", () => {
    expect(isEmptyOrInvalidDateBrStoredValue([])).toBe(true);
  });
});
