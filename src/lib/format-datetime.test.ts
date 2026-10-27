import { describe, expect, it } from "vitest";
import {
  daysBetweenYmd,
  formatDateYmdBr,
  formatMaybeDateLikeBr,
  maskHmDigitsInput,
  normalizeTimeToHm,
  parseHmDigits,
  parseBrDateDigitsToYmd,
  parseDateOnlyInput,
  saoPauloDateYmd,
  saoPauloMidnightIso,
} from "./format-datetime";

describe("horário digitado (teste ponta a ponta 4)", () => {
  it("máscara hh:mm enquanto digita", () => {
    expect(maskHmDigitsInput("14")).toBe("14");
    expect(maskHmDigitsInput("143")).toBe("14:3");
    expect(maskHmDigitsInput("14305")).toBe("14:30");
  });

  it("só aceita 00:00 a 23:59; 930 vira 09:30", () => {
    expect(parseHmDigits("1430")).toBe("14:30");
    expect(parseHmDigits("930")).toBe("09:30");
    expect(parseHmDigits("2575")).toBeNull();
    expect(parseHmDigits("2400")).toBeNull();
    expect(parseHmDigits("14")).toBeNull();
  });
});

describe("formatDateYmdBr", () => {
  it("converts yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(formatDateYmdBr("2026-04-15")).toBe("15/04/2026");
  });

  it("uses date part of ISO string", () => {
    expect(formatDateYmdBr("2026-04-15T00:00:00.000Z")).toBe("15/04/2026");
  });
});

describe("datas sem hora em São Paulo", () => {
  it("lê yyyy-mm-dd, dd/mm/aaaa e ISO, recusando data impossível", () => {
    expect(parseDateOnlyInput("2026-10-20")).toBe("2026-10-20");
    expect(parseDateOnlyInput("20/10/2026")).toBe("2026-10-20");
    expect(parseDateOnlyInput("2026-10-20T03:00:00+00:00")).toBe("2026-10-20");
    expect(parseDateOnlyInput("31/02/2026")).toBeNull();
    expect(parseDateOnlyInput("amanhã")).toBeNull();
  });

  it("grava a meia-noite de São Paulo, que continua no mesmo dia no Brasil", () => {
    const iso = saoPauloMidnightIso("2026-10-20");
    expect(iso).toBe("2026-10-20T03:00:00.000Z");
    expect(saoPauloDateYmd(new Date(iso))).toBe("2026-10-20");
    // T00:00Z (gravação antiga) cai no dia anterior em São Paulo.
    expect(saoPauloDateYmd(new Date("2026-10-20T00:00:00Z"))).toBe("2026-10-19");
  });

  it("conta dias corridos entre datas civis", () => {
    expect(daysBetweenYmd("2026-10-18", "2026-10-20")).toBe(2);
    expect(daysBetweenYmd("2026-10-21", "2026-10-20")).toBe(-1);
    expect(daysBetweenYmd("2026-10-20", "x")).toBeNull();
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
