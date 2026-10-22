import { describe, expect, it } from "vitest";

import {
  competencyMonthToYmd,
  formatCompetencyLabel,
  maskCompetencyMonth,
  ymdToCompetencyMonth,
} from "./competency-month";

describe("competência mês/ano", () => {
  it("mascara a digitação e converte para o 1º dia do mês", () => {
    expect(maskCompetencyMonth("102026")).toBe("10/2026");
    expect(maskCompetencyMonth("1")).toBe("1");
    expect(competencyMonthToYmd("10/2026")).toBe("2026-10-01");
    expect(competencyMonthToYmd("13/2026")).toBeNull();
    expect(competencyMonthToYmd("10/20")).toBeNull();
  });

  it("mostra a competência como mês/ano", () => {
    expect(ymdToCompetencyMonth("2026-10-01")).toBe("10/2026");
    expect(formatCompetencyLabel("2026-10-01")).toBe("out/2026");
    expect(formatCompetencyLabel("2026-01-01")).toBe("jan/2026");
  });
});
