import { describe, expect, it } from "vitest";
import { aggregateSioeUsage } from "./usage";

describe("aggregateSioeUsage", () => {
  it("conta pastas ativas únicas e hours do mês, inclusive com cobrar irrelevante", () => {
    const usage = aggregateSioeUsage({
      competency: "2026-09-01",
      folderRows: [
        { id: "p1", area: "Trabalhista", departamento: "Trabalhista" },
        { id: "p1", area: "Trabalhista", departamento: "Trabalhista" },
        { id: "p2", area: "Trabalhista", departamento: null },
      ],
      hourRows: [
        { id: "h1", area: "Trabalhista", hours: 300.1 },
        { id: "h2", area: "Trabalhista", hours: 38.05 },
      ],
    });
    expect(usage.foldersTotal).toBe(2);
    expect(usage.foldersByArea).toEqual({ Trabalhista: 2 });
    expect(usage.hoursTotal).toBeCloseTo(338.15);
    expect(usage.hoursByArea.Trabalhista).toBeCloseTo(338.15);
  });
});
