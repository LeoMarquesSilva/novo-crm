import { describe, expect, it } from "vitest";

import { parseDueDateText } from "./due-date-text";

describe("parseDueDateText", () => {
  it("lê datas escritas no texto", () => {
    expect(parseDueDateText("2026-10-20")).toEqual({ date: "2026-10-20", basis: "data" });
    expect(parseDueDateText("na data de 20/10/2026")).toEqual({ date: "2026-10-20", basis: "data" });
    expect(parseDueDateText("até 5.11.26")).toEqual({ date: "2026-11-05", basis: "data" });
    expect(parseDueDateText("em 20 de outubro de 2026")).toEqual({ date: "2026-10-20", basis: "data" });
    expect(parseDueDateText("1º de março de 2027")).toEqual({ date: "2027-03-01", basis: "data" });
  });

  it("recusa data inexistente e texto sem data", () => {
    expect(parseDueDateText("31/02/2026")).toBeNull();
    expect(parseDueDateText("na data de")).toBeNull();
    expect(parseDueDateText("")).toBeNull();
    expect(parseDueDateText(null)).toBeNull();
  });

  it("vencimento ligado à assinatura usa a data da assinatura quando conhecida", () => {
    const signedOn = "2026-10-18";
    expect(parseDueDateText("na data de assinatura do Contrato", { signedOn })).toEqual({
      date: "2026-10-18",
      basis: "assinatura",
    });
    expect(parseDueDateText("30 (trinta) dias após a assinatura", { signedOn })).toEqual({
      date: "2026-11-17",
      basis: "assinatura",
    });
    expect(parseDueDateText("na data de assinatura do Contrato")).toBeNull();
    expect(parseDueDateText("5 dias úteis após a assinatura", { signedOn })).toBeNull();
    expect(parseDueDateText("no mês seguinte à assinatura", { signedOn })).toBeNull();
  });
});
