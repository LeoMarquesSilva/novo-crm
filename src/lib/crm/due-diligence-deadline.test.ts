import { describe, expect, it } from "vitest";
import { dueDeadlineInstantIso, prazoBrasiliaIso } from "./due-diligence-deadline";

describe("prazoBrasiliaIso", () => {
  it("lê a hora como horário de Brasília, em qualquer fuso do servidor", () => {
    // 18:00 em Brasília = 21:00 UTC (no servidor da Vercel virava 18:00 UTC, 3 h antes).
    expect(prazoBrasiliaIso("2026-11-19", "18:00")).toBe("2026-11-19T21:00:00.000Z");
    expect(prazoBrasiliaIso("2026-11-19", "18:00:00")).toBe("2026-11-19T21:00:00.000Z");
    expect(prazoBrasiliaIso("2026-11-19", "09:30")).toBe("2026-11-19T12:30:00.000Z");
  });

  it("sem horário usa 18:00", () => {
    expect(prazoBrasiliaIso("2026-11-19", null)).toBe("2026-11-19T21:00:00.000Z");
    expect(prazoBrasiliaIso("2026-11-19", "  ")).toBe("2026-11-19T21:00:00.000Z");
  });

  it("sem data ou data inválida devolve null", () => {
    expect(prazoBrasiliaIso(null, "18:00")).toBeNull();
    expect(prazoBrasiliaIso("", "18:00")).toBeNull();
    expect(prazoBrasiliaIso("19/11/2026", "18:00")).toBeNull();
  });

  it("aceita a data com hora do Postgres e casa com o prazo da DUE", () => {
    expect(prazoBrasiliaIso("2026-11-19T00:00:00", "18:00")).toBe("2026-11-19T21:00:00.000Z");
    expect(Date.parse(dueDeadlineInstantIso("2026-11-19", "18:00")!)).toBe(
      Date.parse(prazoBrasiliaIso("2026-11-19", "18:00")!),
    );
  });
});
