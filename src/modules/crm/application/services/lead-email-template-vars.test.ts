import { describe, expect, it } from "vitest";

import {
  buildLeadEmailHtmlVars,
  buildLeadEmailSubjectVars,
  SAMPLE_LEAD_EMAIL_PAYLOAD,
} from "./lead-email-template-vars";

describe("datas e horários do e-mail de novo lead", () => {
  const payload = {
    ...SAMPLE_LEAD_EMAIL_PAYLOAD,
    data_entrega_due: "2026-05-15",
    horario_entrega_due: "18:00:00",
    data_reuniao: "2026-05-20",
    horario_reuniao: "14:30:00",
  };

  it.each([
    ["corpo", buildLeadEmailHtmlVars],
    ["assunto", buildLeadEmailSubjectVars],
  ])("%s: dd/mm/aaaa e hh:mm", (_label, build) => {
    const vars = build(payload);
    expect(vars.data_entrega_due).toBe("15/05/2026");
    expect(vars.horario_entrega_due).toBe("18:00");
    expect(vars.prazo_entrega_due).toBe("15/05/2026 às 18:00");
    expect(vars.data_reuniao).toBe("20/05/2026");
    expect(vars.horario_reuniao).toBe("14:30");
    expect(vars.reuniao_data_horario_sem).toBe("20/05/2026 às 14:30");
  });

  it("sem data mostra o texto de sempre", () => {
    const vars = buildLeadEmailSubjectVars({
      ...payload,
      data_entrega_due: null,
      horario_entrega_due: null,
      data_reuniao: null,
      horario_reuniao: null,
    });
    expect(vars.data_entrega_due).toBe("Não informado");
    expect(vars.prazo_entrega_due).toBe("Não informado");
    expect(vars.data_reuniao).toBe("Não informado");
    expect(vars.reuniao_data_horario_sem).toBe("A definir");
  });
});
