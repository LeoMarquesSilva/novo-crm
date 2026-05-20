import { describe, expect, it } from "vitest";
import { buildDueSharePointAgendamentoFields } from "@/modules/crm/application/services/build-due-sharepoint-agendamento-fields";
import type { NewLeadPayload } from "@/modules/crm/application/services/new-lead-payload";

const payload: NewLeadPayload = {
  solicitante: "Gustavo Bismarchi",
  email: "gustavo@bismarchipires.com.br",
  cadastrado_por: "lavinia.ferraz@bismarchipires.com.br",
  due_diligence: "Sim",
  data_entrega_due: "2026-04-09",
  horario_entrega_due: "17:30",
  empresas: [
    {
      tipo_documento: "CNPJ",
      razao_social: "LOGOS TELEATENDIMENTO E COBRANCAS LTDA",
      documento: "07.597.745/0001-29",
    },
    {
      tipo_documento: "CNPJ",
      razao_social: "LOGOS TELEATENDIMENTO LTDA",
      documento: "10.983.862/0001-35",
    },
  ],
  areas_analise: ["Cível", "Tributário"],
  local_reuniao: "N/A",
  data_reuniao: "2026-04-10",
  horario_reuniao: "11:30",
  tipo_de_lead: "Indicacao",
  tipo_indicacao: "Consultor",
  nome_indicacao: "Felipe da Triunfae",
  contexto_comercial: null,
};

describe("buildDueSharePointAgendamentoFields", () => {
  it("maps due lead payload to SharePoint internal column names", () => {
    const fields = buildDueSharePointAgendamentoFields(payload);

    expect(fields.PROCESSO).toContain("DUE DILIGENCE - LOGOS TELEATENDIMENTO");
    expect(fields.DESCRI_x00c7__x00c3_ODOPRAZO).toContain("07.597.745/0001-29");
    expect(fields.DATA_x002d_ENVIAR).toBe("2026-04-09");
    expect(fields.ENVIAR).toBe("lavinia.ferraz@bismarchipires.com.br");
    expect(fields.Status).toBe("Pendente");
    expect(fields.TIPO_x0020_DE_x0020_A_x00c7__x00).toBe("Due Diligence Prospect");
    expect(String(fields.MOTIVO_x0020__x002f__x0020_OBSER)).toContain("Cível, Tributário");
    expect(String(fields.MOTIVO_x0020__x002f__x0020_OBSER)).toContain(
      "LOGOS TELEATENDIMENTO LTDA - 10.983.862/0001-35",
    );
  });
});
