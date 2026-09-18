import { describe, expect, it } from "vitest";
import {
  addCalendarYears,
  applyAnnualRenewalDefaults,
  effectiveContractRenewalDate,
  inferAnnualRenewalDate,
  inferRenewalAlertDate,
} from "./contract-renewal-date";

describe("inferAnnualRenewalDate", () => {
  it("soma 1 ano civil, inclusive em 29/02", () => {
    expect(inferAnnualRenewalDate("2026-04-30")).toBe("2027-04-30");
    expect(addCalendarYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("usa a data persistida quando existe e cai no início + 1 ano se estiver vazia", () => {
    expect(effectiveContractRenewalDate("2028-01-15", "2026-01-15")).toBe("2028-01-15");
    expect(effectiveContractRenewalDate(null, "2026-08-03")).toBe("2027-08-03");
    expect(effectiveContractRenewalDate(null, null)).toBeNull();
  });

  it("preenche alerta com 30 dias de antecedência só quando a data-base existe", () => {
    expect(inferRenewalAlertDate("2027-04-30")).toBe("2027-03-31");
    expect(inferRenewalAlertDate(null)).toBeNull();
    expect(
      applyAnnualRenewalDefaults({
        startsAt: "2026-08-06",
        renewalDate: null,
        renewalAlertDate: null,
      }),
    ).toEqual({
      startsAt: "2026-08-06",
      renewalDate: "2027-08-06",
      renewalAlertDate: "2027-07-07",
    });
  });
});
