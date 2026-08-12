const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export type ContractDailyPlanningRow = {
  id: string;
  lifecycle: string;
  startsAt: string | null;
  endsAt: string | null;
  indefinite: boolean;
  firstDueDate: string | null;
  dueDay: number | null;
  closingLeadDays: number;
  renewalDate: string | null;
  renewalAlertDate: string | null;
  operationalResponsibleId: string | null;
  renewalResponsibleId: string | null;
  opportunityStage?: string | null;
};

export type ContractAlertIntent = {
  contractId: string;
  type: "contrato_implantacao_pendente" | "contrato_renovacao_pendente";
  baseDate: string;
  dueDate: string;
  assigneeId: string | null;
  idempotencyKey: string;
};

export type ContractClosingIntent = {
  contractId: string;
  competency: string;
  dueDate: string;
  assigneeId: string | null;
  idempotencyKey: string;
};

type PlanInput = {
  today: string;
  contracts: ContractDailyPlanningRow[];
  existingIdempotencyKeys?: Iterable<string>;
};

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function addYears(value: string, years: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function dueDateForCompetency(competency: string, dueDay: number): string {
  const [year, month] = competency.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${competency}-${String(Math.min(Math.max(dueDay, 1), lastDay)).padStart(2, "0")}`;
}

function renewalWindow(contract: ContractDailyPlanningRow, today: string) {
  const inferredBase = contract.indefinite
    ? (contract.startsAt ? addYears(contract.startsAt, 1) : null)
    : contract.endsAt;
  if (!contract.renewalDate && !inferredBase) return null;
  let baseDate = contract.renewalDate ?? inferredBase as string;
  let alertDate = contract.renewalAlertDate ?? addDays(baseDate, -30);
  while (contract.indefinite && baseDate < today) {
    baseDate = addYears(baseDate, 1);
    alertDate = addYears(alertDate, 1);
  }
  return { baseDate, alertDate };
}

export function saoPauloDateFromInstant(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function planContractDailyWork(input: PlanInput): {
  alerts: ContractAlertIntent[];
  closings: ContractClosingIntent[];
} {
  const existing = new Set(input.existingIdempotencyKeys ?? []);
  const alerts: ContractAlertIntent[] = [];
  const closings: ContractClosingIntent[] = [];

  for (const contract of input.contracts) {
    if (contract.lifecycle === "suspenso" || contract.lifecycle === "encerrado") continue;
    if (contract.startsAt && contract.startsAt > input.today) continue;
    if (contract.endsAt && contract.endsAt < input.today) continue;

    if (contract.opportunityStage === "inclusao_faturamento") {
      const idempotencyKey = `contract-setup:${contract.id}`;
      if (!existing.has(idempotencyKey)) {
        alerts.push({
          contractId: contract.id,
          type: "contrato_implantacao_pendente",
          baseDate: input.today,
          dueDate: input.today,
          assigneeId: contract.operationalResponsibleId,
          idempotencyKey,
        });
      }
    }

    if (contract.lifecycle !== "ativo") continue;

    const competency = input.today.slice(0, 7);
    const fallbackDueDay = contract.firstDueDate ? Number(contract.firstDueDate.slice(8, 10)) : null;
    const dueDay = contract.dueDay ?? fallbackDueDay;
    if (dueDay) {
      const dueDate = dueDateForCompetency(competency, dueDay);
      const triggerDate = addDays(dueDate, -Math.max(0, contract.closingLeadDays));
      const idempotencyKey = `contract-closing:${contract.id}:${competency}`;
      if (input.today >= triggerDate && !existing.has(idempotencyKey)) {
        closings.push({
          contractId: contract.id,
          competency,
          dueDate,
          assigneeId: contract.operationalResponsibleId,
          idempotencyKey,
        });
      }
    }

    const renewal = renewalWindow(contract, input.today);
    if (renewal && input.today >= renewal.alertDate) {
      const idempotencyKey = `contract-renewal:${contract.id}:${renewal.baseDate}`;
      if (!existing.has(idempotencyKey)) {
        alerts.push({
          contractId: contract.id,
          type: "contrato_renovacao_pendente",
          baseDate: renewal.baseDate,
          dueDate: renewal.baseDate,
          assigneeId: contract.renewalResponsibleId,
          idempotencyKey,
        });
      }
    }
  }

  return { alerts, closings };
}
