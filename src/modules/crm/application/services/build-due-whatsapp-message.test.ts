import { describe, expect, it } from "vitest";
import { WHATSAPP_TEMPLATE_DEFS, renderWhatsappTemplate } from "@/lib/crm/whatsapp/templates";
import {
  buildDueWhatsappMessage,
  buildDueWhatsappValues,
  crossSellingAreas,
  newLeadWhatsappTemplateKey,
  type BuildDueWhatsappMessageInput,
} from "@/modules/crm/application/services/build-due-whatsapp-message";

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

    expect(message).toContain("- *EMPRESA A* · CNPJ 00.000.000/0001-00\n- *EMPRESA B* · CNPJ 11.111.111/0001-11");
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

    expect(message).toContain("*NOVO LEAD · DUE DILIGENCE*");
    expect(message).toContain(
      "*Captador*\nAline Ferreira\naline.ferreira@bismarchipires.com.br · cadastrado por bruno.martins@bismarchipires.com.br",
    );
    expect(message).toContain("- *Tipo:* Indicação");
    expect(message).not.toContain("Indicacao");
    expect(message).toContain("- *Áreas de análise:* Cível, Tributário");
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

    expect(message).toContain("- *Tipo:* Lead Ativa");
    expect(message).not.toContain("*Indicação:*");
    expect(message).not.toContain("*Nome da indicação:*");
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

    expect(message).toContain("- *Tipo:* Cross Selling");
    expect(message).toContain("- *Origem do cross-selling:* Cliente já atendido pelo Tributário");
    expect(message).not.toContain("*Indicação:*");
    expect(message).not.toContain("*Nome da indicação:*");
  });

  it("mostra valores legíveis: plataforma, área do cross-selling, horário sem segundos e Não com acento", () => {
    const base = {
      solicitante: "Felipe Camargo",
      cadastrado_por: "leonardo.marques@bismarchipires.com.br",
      email: "felipe@bismarchipires.com.br",
      razao_social_completa: "CLIENTE LTDA",
      cnpj_completo: "11.222.333/0001-81",
      tipo_indicacao: null,
      nome_indicacao: null,
      data_entrega_due: "2026-05-13",
      horario_entrega_due: "18:00:00",
      areas_analise: ["Cível" as const],
      local_reuniao: "A definir",
      data_reuniao: "2026-05-14",
      horario_reuniao: "12:00:00",
      empresas: [{ tipo_documento: "CNPJ" as const, razao_social: "CLIENTE LTDA", documento: "11.222.333/0001-81" }],
      contexto_comercial: null,
    };

    const digital = buildDueWhatsappMessage({
      ...base,
      due_diligence: "Nao",
      tipo_de_lead: "Lead Digital",
      plataforma: "Instagram",
    });
    expect(digital).toContain("- *Plataforma:* Instagram");
    expect(digital).toContain("*Due diligence:* Não");
    expect(digital).toContain("- *Quando:* 14/05/2026 às 12:00\n");

    const cross = buildDueWhatsappMessage({
      ...base,
      due_diligence: "Sim",
      tipo_de_lead: "Cross Selling",
      area_cross_selling: "Tributário",
    });
    expect(cross).toContain("- *Prazo de entrega:* 13/05/2026 às 18:00\n");
    expect(cross).toContain("- *Área do cross-selling:* Tributário");
    expect(cross).toContain("- *Origem do cross-selling:* Cliente da base / relacionamento existente");
  });
});

const RODAPE = "_Mensagem automática do CRM · Bismarchi | Pires_";
/** 04/11/2026 14:30 em Brasília. */
const AGORA = new Date("2026-11-04T17:30:00Z");
const LINK = "https://crm.exemplo.com.br/crm/leads/abc";

function lead(overrides: Partial<BuildDueWhatsappMessageInput> = {}): BuildDueWhatsappMessageInput {
  return {
    solicitante: "Ana",
    cadastrado_por: "ana@x.com",
    email: "ana@x.com",
    due_diligence: "Sim",
    data_entrega_due: "2026-10-26",
    horario_entrega_due: "18:00",
    empresas: [{ tipo_documento: "CNPJ", razao_social: "ACME", documento: "00.000.000/0001-00" }],
    areas_analise: ["Cível"],
    local_reuniao: "A definir",
    data_reuniao: "2026-10-27",
    horario_reuniao: "12:00",
    tipo_de_lead: "Lead Ativa",
    contexto_comercial: null,
    razao_social_completa: "ACME",
    cnpj_completo: "00.000.000/0001-00",
    ...overrides,
  };
}

describe("aviso de lead novo no grupo da DUE", () => {
  it("escolhe o modelo pelo due diligence", () => {
    expect(newLeadWhatsappTemplateKey({ due_diligence: "Sim" })).toBe("novo_lead_due");
    expect(newLeadWhatsappTemplateKey({ due_diligence: "Nao" })).toBe("novo_lead");
  });

  it("lead com DUE: modelo novo_lead_due com a formatação do WhatsApp", () => {
    const text = buildDueWhatsappMessage(
      lead({
        empresas: [
          { tipo_documento: "CNPJ", razao_social: "ACME", documento: "00.000.000/0001-00" },
          { tipo_documento: "CPF", razao_social: "JOÃO DA SILVA", documento: "123.456.789-09" },
        ],
      }),
      { now: AGORA, link: LINK, avisos: "*Atenção:* nenhum usuário cadastrado na área Cível." },
    );
    expect(text).toBe(
      [
        "*NOVO LEAD · DUE DILIGENCE*",
        "_Cadastrado em 04/11/2026 às 14:30_",
        "",
        "*Empresas e pessoas*",
        "- *ACME* · CNPJ 00.000.000/0001-00",
        "- *JOÃO DA SILVA* · CPF 123.456.789-09",
        "",
        "*Due diligence*",
        "- *Prazo de entrega:* 26/10/2026 às 18:00",
        "- *Áreas de análise:* Cível",
        "",
        "*Origem do lead*",
        "- *Tipo:* Lead Ativa",
        "",
        "*Reunião*",
        "- *Quando:* 27/10/2026 às 12:00",
        "- *Local:* A definir",
        "",
        "*Captador*",
        "Ana",
        "ana@x.com",
        "",
        "> *Atenção:* nenhum usuário cadastrado na área Cível.",
        "",
        `*Abrir no CRM:* ${LINK}`,
        "",
        RODAPE,
      ].join("\n"),
    );
  });

  it("sem link público nem avisos, as linhas somem", () => {
    const text = buildDueWhatsappMessage(lead(), { now: AGORA, link: "/crm/leads/abc" });
    expect(text).not.toContain("Abrir no CRM");
    expect(text).not.toContain(">");
    expect(text).toContain("ana@x.com\n\n" + RODAPE);
  });

  it("lead sem DUE: modelo novo_lead, sem título de DUE nem bloco de prazo", () => {
    const text = buildDueWhatsappMessage(
      lead({
        due_diligence: "Nao",
        data_entrega_due: null,
        horario_entrega_due: null,
        data_reuniao: null,
        horario_reuniao: null,
        areas_analise: ["Cível", "Tributário"],
        cadastrado_por: "bruno@x.com",
      }),
      { now: AGORA, link: LINK },
    );
    expect(text).toBe(
      [
        "*NOVO LEAD*",
        "_Cadastrado em 04/11/2026 às 14:30_",
        "",
        "*Empresas e pessoas*",
        "- *ACME* · CNPJ 00.000.000/0001-00",
        "",
        "*Áreas de análise*",
        "Cível, Tributário",
        "",
        "*Origem do lead*",
        "- *Tipo:* Lead Ativa",
        "",
        "*Reunião*",
        "- *Quando:* A definir",
        "- *Local:* A definir",
        "",
        "*Captador*",
        "Ana",
        "ana@x.com · cadastrado por bruno@x.com",
        "",
        "*Due diligence:* Não",
        "",
        `*Abrir no CRM:* ${LINK}`,
        "",
        RODAPE,
      ].join("\n"),
    );
    expect(text).not.toContain("DUE DILIGENCE");
    expect(text).not.toContain("Prazo de entrega");
  });

  it("lead sem DUE ignora avisos de área sem responsável", () => {
    const values = buildDueWhatsappValues(lead({ due_diligence: "Nao" }), "*Atenção:* área sem responsável.");
    const text = renderWhatsappTemplate(WHATSAPP_TEMPLATE_DEFS.novo_lead.defaultBody, values);
    expect(text).not.toContain("Atenção");
  });

  it("cross-selling com várias áreas: rótulo no plural e áreas separadas por vírgula", () => {
    const cross = { due_diligence: "Nao" as const, tipo_de_lead: "Cross Selling" as const };

    const lista = buildDueWhatsappMessage(lead({ ...cross, area_cross_selling: ["Tributário", "Trabalhista"] }));
    expect(lista).toContain("- *Áreas do cross-selling:* Tributário, Trabalhista\n");
    expect(lista).not.toContain("*Área do cross-selling:*");

    const separadas = buildDueWhatsappMessage(
      lead({ ...cross, area_cross_selling: "Tributário", areas_cross_selling: ["Tributário", " Cível ", ""] }),
    );
    expect(separadas).toContain("- *Áreas do cross-selling:* Tributário, Cível\n");

    const uma = buildDueWhatsappMessage(lead({ ...cross, area_cross_selling: null, areas_cross_selling: ["Cível"] }));
    expect(uma).toContain("- *Área do cross-selling:* Cível\n");

    const nenhuma = buildDueWhatsappMessage(lead({ ...cross, area_cross_selling: [], areas_cross_selling: null }));
    expect(nenhuma).not.toMatch(/Áreas? do cross-selling/);
    expect(nenhuma).toContain("- *Origem do cross-selling:*");
  });

  it("crossSellingAreas junta os dois formatos sem repetir", () => {
    expect(crossSellingAreas({ area_cross_selling: "Cível", areas_cross_selling: ["Cível", "Tributário"] })).toEqual([
      "Cível",
      "Tributário",
    ]);
    expect(crossSellingAreas({})).toEqual([]);
  });
});
