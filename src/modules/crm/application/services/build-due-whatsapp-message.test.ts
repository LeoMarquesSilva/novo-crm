import { describe, expect, it } from "vitest";
import { buildDueWhatsappMessage } from "@/modules/crm/application/services/build-due-whatsapp-message";

describe("buildDueWhatsappMessage", () => {
  it("includes all companies and documents from the lead intake", () => {
    const message = buildDueWhatsappMessage({
      solicitante: "Gustavo Bismarchi",
      email: "gustavo@bismarchipires.com.br",
      cadastrado_por: "lavinia.ferraz@bismarchipires.com.br",
      due_diligence: "Sim",
      data_entrega_due: "2026-04-09",
      horario_entrega_due: "17:30",
      empresas: [
        {
          tipo_documento: "CNPJ",
          razao_social: "EMPRESA A",
          documento: "00.000.000/0001-00",
        },
        {
          tipo_documento: "CNPJ",
          razao_social: "EMPRESA B",
          documento: "11.111.111/0001-11",
        },
      ],
      areas_analise: ["Cível"],
      local_reuniao: "N/A",
      data_reuniao: "2026-04-10",
      horario_reuniao: "11:30",
      tipo_de_lead: "Indicacao",
      tipo_indicacao: "Consultor",
      nome_indicacao: "Parceiro",
      contexto_comercial: null,
      razao_social_completa: "EMPRESA A",
      cnpj_completo: "00.000.000/0001-00",
    });

    expect(message).toContain("EMPRESA A, EMPRESA B");
    expect(message).toContain("00.000.000/0001-00, 11.111.111/0001-11");
  });

  it("renders all sections and interpolated values", () => {
    const message = buildDueWhatsappMessage({
      solicitante: "Aline Ferreira",
      cadastrado_por: "bruno.martins@bismarchipires.com.br",
      email: "aline.ferreira@bismarchipires.com.br",
      razao_social_completa: "EMPRESA TESTE LTDA",
      cnpj_completo: "12.345.678/0001-90",
      tipo_de_lead: "Indicacao",
      tipo_indicacao: "Consultor",
      nome_indicacao: "Parceiro XPTO",
      data_entrega_due: "2026-05-20",
      horario_entrega_due: "10:30",
      areas_analise: ["Cível", "Tributário"],
      local_reuniao: "Escritório SP",
      data_reuniao: "2026-05-22",
      horario_reuniao: "14:00",
      due_diligence: "Sim",
      empresas: [
        {
          tipo_documento: "CNPJ",
          razao_social: "EMPRESA TESTE LTDA",
          documento: "12.345.678/0001-90",
        },
      ],
      contexto_comercial: "Contexto",
    });

    expect(message).toContain("*Novo Lead com Due Diligence*");
    expect(message).toContain("*Solicitante:* Aline Ferreira");
    expect(message).toContain("*Tipo de Lead:* Indicacao");
    expect(message).toContain("- *Áreas de Análise:* Cível, Tributário");
    expect(message).toContain("20/05/2026");
    expect(message).toContain("22/05/2026");
  });

  it("omits indication fields when the lead is not an indication", () => {
    const message = buildDueWhatsappMessage({
      solicitante: "Felipe Camargo",
      cadastrado_por: "leonardo.marques@bismarchipires.com.br",
      email: "felipe@bismarchipires.com.br",
      razao_social_completa: "TESTANDO CRM NEW",
      cnpj_completo: "11.111.111/1111-11",
      tipo_de_lead: "Lead Ativa",
      tipo_indicacao: null,
      nome_indicacao: null,
      data_entrega_due: "2026-05-13",
      horario_entrega_due: "11:00",
      areas_analise: ["Cível", "Trabalhista"],
      local_reuniao: "SALA 01",
      data_reuniao: "2026-05-14",
      horario_reuniao: "14:30",
      due_diligence: "Sim",
      empresas: [
        {
          tipo_documento: "CNPJ",
          razao_social: "TESTANDO CRM NEW",
          documento: "11.111.111/1111-11",
        },
      ],
      contexto_comercial: null,
    });

    expect(message).toContain("*Tipo de Lead:* Lead Ativa");
    expect(message).not.toContain("*Indicação:*");
    expect(message).not.toContain("*Nome da Indicação:*");
  });

  it("renders a specific origin line for cross-selling leads", () => {
    const message = buildDueWhatsappMessage({
      solicitante: "Felipe Camargo",
      cadastrado_por: "leonardo.marques@bismarchipires.com.br",
      email: "felipe@bismarchipires.com.br",
      razao_social_completa: "CLIENTE BASE LTDA",
      cnpj_completo: "22.222.222/0001-22",
      tipo_de_lead: "Cross Selling",
      tipo_indicacao: null,
      nome_indicacao: null,
      data_entrega_due: "2026-05-13",
      horario_entrega_due: "11:00",
      areas_analise: ["Cível"],
      local_reuniao: "SALA 01",
      data_reuniao: "2026-05-14",
      horario_reuniao: "14:30",
      due_diligence: "Sim",
      empresas: [
        {
          tipo_documento: "CNPJ",
          razao_social: "CLIENTE BASE LTDA",
          documento: "22.222.222/0001-22",
        },
      ],
      contexto_comercial: "Cliente já atendido pelo Tributário",
    });

    expect(message).toContain("*Tipo de Lead:* Cross Selling");
    expect(message).toContain("*Origem do Cross-selling:* Cliente já atendido pelo Tributário");
    expect(message).not.toContain("*Indicação:*");
    expect(message).not.toContain("*Nome da Indicação:*");
  });
});
