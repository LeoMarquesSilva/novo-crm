import { describe, expect, it } from "vitest";

import { getLeadPipelineSituation } from "./lead-pipeline-situation";

describe("getLeadPipelineSituation", () => {
  it.each([
    [{ encerramento: null, etapa: "reuniao" }, "em_andamento"],
    [{ encerramento: "perdido", etapa: "reuniao" }, "perdidas"],
    [{ encerramento: null, etapa: "contrato_assinado" }, "vendidas"],
    [{ encerramento: null, etapa: "inclusao_faturamento" }, "vendidas"],
    [{ encerramento: "ganho", etapa: "boas_vindas" }, "vendidas"],
  ] as const)("%j → %s", (lead, expected) => {
    expect(getLeadPipelineSituation(lead as never)).toBe(expected);
  });
});
