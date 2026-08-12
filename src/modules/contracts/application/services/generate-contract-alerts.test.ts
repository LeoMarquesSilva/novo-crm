import { describe, expect, it } from "vitest";

import {
  planContractDailyWork,
  saoPauloDateFromInstant,
} from "./generate-contract-alerts";

const activeContract = {
  id: "contract-1",
  lifecycle: "ativo",
  startsAt: "2025-09-11",
  endsAt: null,
  indefinite: true,
  firstDueDate: "2025-09-15",
  dueDay: 15,
  closingLeadDays: 10,
  renewalDate: null,
  renewalAlertDate: null,
  operationalResponsibleId: "operator-1",
  renewalResponsibleId: "renewal-1",
} as const;

describe("planContractDailyWork", () => {
  it("planeja renovacao anual de contrato indeterminado com antecedencia padrao de 30 dias", () => {
    const result = planContractDailyWork({
      today: "2026-08-12",
      contracts: [activeContract],
    });

    expect(result.alerts).toContainEqual({
      contractId: "contract-1",
      type: "contrato_renovacao_pendente",
      baseDate: "2026-09-11",
      dueDate: "2026-09-11",
      assigneeId: "renewal-1",
      idempotencyKey: "contract-renewal:contract-1:2026-09-11",
    });
  });

  it("respeita data-base e data de alerta configuradas", () => {
    const result = planContractDailyWork({
      today: "2026-10-05",
      contracts: [{
        ...activeContract,
        renewalDate: "2026-11-20",
        renewalAlertDate: "2026-10-05",
      }],
    });

    expect(result.alerts.find((alert) => alert.type === "contrato_renovacao_pendente"))
      .toMatchObject({ baseDate: "2026-11-20", dueDate: "2026-11-20" });
  });

  it("planeja fechamento na antecedencia configurada ao vencimento", () => {
    const result = planContractDailyWork({
      today: "2026-08-05",
      contracts: [activeContract],
    });

    expect(result.closings).toEqual([{
      contractId: "contract-1",
      competency: "2026-08",
      dueDate: "2026-08-15",
      assigneeId: "operator-1",
      idempotencyKey: "contract-closing:contract-1:2026-08",
    }]);
  });

  it.each(["suspenso", "encerrado"])("nao planeja trabalho para contrato %s", (lifecycle) => {
    const result = planContractDailyWork({
      today: "2026-08-12",
      contracts: [{ ...activeContract, lifecycle }],
    });

    expect(result).toEqual({ alerts: [], closings: [] });
  });

  it("remove intencoes ja persistidas em uma repeticao do job", () => {
    const first = planContractDailyWork({ today: "2026-08-12", contracts: [activeContract] });
    const repeated = planContractDailyWork({
      today: "2026-08-12",
      contracts: [activeContract],
      existingIdempotencyKeys: [
        ...first.alerts.map((item) => item.idempotencyKey),
        ...first.closings.map((item) => item.idempotencyKey),
      ],
    });

    expect(repeated).toEqual({ alerts: [], closings: [] });
  });
});

describe("saoPauloDateFromInstant", () => {
  it("usa a data local de Sao Paulo antes da virada UTC", () => {
    expect(saoPauloDateFromInstant(new Date("2026-01-01T01:30:00.000Z"))).toBe("2025-12-31");
  });
});
