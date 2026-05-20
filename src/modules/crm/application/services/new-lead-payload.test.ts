import { describe, expect, it } from "vitest";
import { newLeadPayloadSchema } from "@/modules/crm/application/services/new-lead-payload";

const validPayload = {
  solicitante: "Aline Ferreira",
  email: "aline.ferreira@bismarchipires.com.br",
  cadastrado_por: "bruno.martins@bismarchipires.com.br",
  due_diligence: "Sim" as const,
  data_entrega_due: "2026-05-20",
  horario_entrega_due: "10:00",
  empresas: [
    {
      tipo_documento: "CNPJ" as const,
      razao_social: "EMPRESA TESTE",
      documento: "12.345.678/0001-90",
    },
  ],
  areas_analise: ["Cível"] as const,
  local_reuniao: "Escritório SP",
  data_reuniao: "2026-05-22",
  horario_reuniao: "14:00",
  tipo_de_lead: "Indicacao" as const,
  tipo_indicacao: "Consultor" as const,
  nome_indicacao: "Parceiro XPTO",
  contexto_comercial: "Lead estratégico",
};

describe("newLeadPayloadSchema", () => {
  it("accepts payload with due diligence and indication", () => {
    const result = newLeadPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects payload without area selection", () => {
    const result = newLeadPayloadSchema.safeParse({
      ...validPayload,
      areas_analise: [],
    });

    expect(result.success).toBe(false);
  });

  it("requires due date and time when due diligence is Sim", () => {
    const result = newLeadPayloadSchema.safeParse({
      ...validPayload,
      data_entrega_due: null,
      horario_entrega_due: null,
    });

    expect(result.success).toBe(false);
  });

  it("requires indication fields when tipo_de_lead is Indicacao", () => {
    const result = newLeadPayloadSchema.safeParse({
      ...validPayload,
      tipo_indicacao: null,
      nome_indicacao: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts minimal payload without due diligence (path used by CRM novo lead)", () => {
    const result = newLeadPayloadSchema.safeParse({
      solicitante: "Nome",
      email: "a@b.com",
      cadastrado_por: "c@b.com",
      due_diligence: "Nao" as const,
      empresas: [
        { tipo_documento: "CNPJ" as const, razao_social: "X", documento: "1" },
      ],
      areas_analise: ["Cível"] as const,
      local_reuniao: "Local",
      tipo_de_lead: "Lead Digital" as const,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.due_diligence).toBe("Nao");
      expect(result.data.data_entrega_due).toBeUndefined();
    }
  });

  it("accepts cross selling as a valid lead type", () => {
    const result = newLeadPayloadSchema.safeParse({
      ...validPayload,
      due_diligence: "Nao" as const,
      data_entrega_due: null,
      horario_entrega_due: null,
      data_reuniao: null,
      horario_reuniao: null,
      tipo_de_lead: "Cross Selling" as const,
      tipo_indicacao: null,
      nome_indicacao: null,
    });

    expect(result.success).toBe(true);
  });
});
