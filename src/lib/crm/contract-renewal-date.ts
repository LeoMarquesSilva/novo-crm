const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Antecedência já usada pelo job diário em `generate-contract-alerts`. */
export const DEFAULT_RENEWAL_ALERT_LEAD_DAYS = 30;

export function addCalendarYears(isoDate: string, years: number): string | null {
  const match = ISO_DATE.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function addCalendarDays(isoDate: string, days: number): string | null {
  if (!ISO_DATE.test(isoDate.trim())) return null;
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Data-base de reajuste anual: 1 ano após o início, inclusive em prazo indeterminado. */
export function inferAnnualRenewalDate(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null;
  return addCalendarYears(startsAt, 1);
}

export function effectiveContractRenewalDate(
  renewalDate: string | null | undefined,
  startsAt: string | null | undefined,
): string | null {
  const stored = renewalDate?.trim() || null;
  return stored ?? inferAnnualRenewalDate(startsAt);
}

export function inferRenewalAlertDate(renewalDate: string | null | undefined): string | null {
  if (!renewalDate) return null;
  return addCalendarDays(renewalDate, -DEFAULT_RENEWAL_ALERT_LEAD_DAYS);
}

export function applyAnnualRenewalDefaults<
  T extends {
    startsAt: string | null;
    renewalDate: string | null;
    renewalAlertDate: string | null;
  },
>(configuration: T): T {
  const renewalDate = configuration.renewalDate ?? inferAnnualRenewalDate(configuration.startsAt);
  const renewalAlertDate = configuration.renewalAlertDate ?? inferRenewalAlertDate(renewalDate);
  return { ...configuration, renewalDate, renewalAlertDate };
}
