import { describe, expect, it } from "vitest";
import type { LeadDetailData } from "./page";
import { groupLeadIntakeFields } from "./lead-detail-overview";

type IntakeField = LeadDetailData["intakeFields"][number];

function field(key: string): IntakeField {
  return { key, label: key, value: `valor-${key}` };
}

describe("groupLeadIntakeFields", () => {
  it("organiza o cadastro por contexto e separa metadados de integração", () => {
    const grouped = groupLeadIntakeFields([
      field("email_solicitante"),
      field("data_reuniao"),
      field("areas_analise"),
      field("campo_legado"),
      field("sharepoint_agendamento_error"),
    ]);

    expect(grouped.requester.map((item) => item.key)).toEqual(["email_solicitante"]);
    expect(grouped.schedule.map((item) => item.key)).toEqual(["data_reuniao"]);
    expect(grouped.commercial.map((item) => item.key)).toEqual(["areas_analise"]);
    expect(grouped.other.map((item) => item.key)).toEqual(["campo_legado"]);
    expect(grouped.integration.map((item) => item.key)).toEqual([
      "sharepoint_agendamento_error",
    ]);
  });

  it("não repete campos já apresentados no resumo", () => {
    const grouped = groupLeadIntakeFields([
      field("tipo_lead"),
      field("due_diligence_intake"),
      field("cadastrado_por"),
    ]);

    expect(grouped.requester.map((item) => item.key)).toEqual(["cadastrado_por"]);
    expect(Object.values(grouped).flat()).toHaveLength(1);
  });
});
