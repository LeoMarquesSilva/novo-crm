import { describe, expect, it } from "vitest";
import { filledFieldsFromLeadIntake } from "./lead-intake-to-fields";

describe("filledFieldsFromLeadIntake", () => {
  it("maps areas, due flag and meeting fields (empresas vêm de empresasIntake na página)", () => {
    const rows = filledFieldsFromLeadIntake(
      {
        cadastrado_por_email: "admin@test.com",
        solicitante_nome: "Aline Ferreira",
        due_diligence: false,
        empresas_json: [
          { tipo_documento: "CNPJ", razao_social: "ACME LTDA", documento: "12.345.678/0001-90" },
        ],
        areas_analise: ["Cível", "Tributário"],
        local_reuniao: "São Paulo",
        data_reuniao: "2026-06-01",
        horario_reuniao: "15:30:00",
        tipo_lead: "Lead Digital",
        tipo_indicacao: null,
        nome_indicacao: null,
        sharepoint_agendamento_id: "42",
        sharepoint_agendamento_url: "https://sharepoint.local/item/42",
        sharepoint_agendamento_created_at: "2026-06-01T18:30:00.000Z",
      },
      { solicitanteEmail: "lead@test.com" },
    );

    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.email_solicitante).toBe("lead@test.com");
    expect(byKey.solicitante_nome).toBe("Aline Ferreira");
    expect(byKey.cadastrado_por).toBe("admin@test.com");
    expect(byKey.due_diligence_intake).toBe("Não");
    expect(byKey.areas_analise).toContain("Cível");
    expect(byKey.local_reuniao).toBe("São Paulo");
    expect(byKey.data_reuniao).toBe("2026-06-01");
    expect(byKey.horario_reuniao).toBe("15:30");
    expect(byKey.tipo_lead).toBe("Lead Digital");
    expect(byKey.sharepoint_agendamento_id).toBe("42");
    expect(byKey.sharepoint_agendamento_url).toBe("https://sharepoint.local/item/42");
  });
});
