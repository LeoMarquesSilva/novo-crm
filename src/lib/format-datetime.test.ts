import { describe, expect, it } from "vitest";
import {
  formatDateYmdBr,
  formatMaybeDateLikeBr,
  normalizeTimeToHm,
  parseBrDateDigitsToYmd,
} from "./format-datetime";

describe("formatDateYmdBr", () => {
  it("converts yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(formatDateYmdBr("2026-04-15")).toBe("15/04/2026");
  });

  it("uses date part of ISO string", () => {
    expect(formatDateYmdBr("2026-04-15T00:00:00.000Z")).toBe("15/04/2026");
  });
});

describe("formatMaybeDateLikeBr", () => {
  it("formats plain ymd and iso datetime", () => {
    expect(formatMaybeDateLikeBr("2026-01-10")).toBe("10/01/2026");
    expect(formatMaybeDateLikeBr("15/03/2026")).toBe("15/03/2026");
  });
});

describe("normalizeTimeToHm", () => {
  it("normalizes HH:mm and HH:mm:ss", () => {
    expect(normalizeTimeToHm("9:5")).toBe("09:05");
    expect(normalizeTimeToHm("15:30:00")).toBe("15:30");
    expect(normalizeTimeToHm("")).toBe("");
  });
});

describe("parseBrDateDigitsToYmd", () => {
  it("parses ddmmyyyy digits", () => {
    expect(parseBrDateDigitsToYmd("23042026")).toBe("2026-04-23");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseBrDateDigitsToYmd("31022026")).toBe(null);
  });
});
