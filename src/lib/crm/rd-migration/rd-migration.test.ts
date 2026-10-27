import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/crm/crm-field-schema";

import { planRdMigration, resolveRdMigrationResponsible } from "./plan";
import {
  buildRdMigrationPrefill,
  parseRdAddress,
  parseRdDate,
  rdAreaToCrm,
  rdRateioPorArea,
} from "./prefill";
import { readRdDeal } from "./rd-deal";
import { computeRdMigrationRequirements, rdMigrationNeedsForStage } from "./requirements";
import { resolveRdMigrationScope } from "./scope";
import { mergeRdMigrationValues, parseRdMigrationValues, type RdMigrationValues } from "./values";

function details(input: {
  stage: string;
  win?: boolean | null;
  owner?: string;
  closedAt?: string;
  fields: Record<string, string | string[]>;
}) {
  return {
    source: "import",
    deal: {
      id: "68924d7526c1f50018dc039b",
      name: "RENATO MAROTTA STAREK",
      win: input.win ?? null,
      closed_at: input.closedAt ?? null,
      updated_at: "2026-10-16T10:00:00-03:00",
      deal_stage: { id: "x", name: input.stage },
      user: { name: "Leonardo Marques Silva", email: input.owner ?? "leonardo.marques@bismarchipires.com.br" },
      deal_custom_fields: Object.entries(input.fields).map(([label, value]) => ({ value, custom_field: { label } })),
    },
  };
}

const USERS = [
  { id: "u-ana", fullName: "Ana Paula Souza", email: "ana.souza@bismarchipires.com.br" },
  { id: "u-leo", fullName: "Leonardo Marques Silva", email: "leonardo.marques@bismarchipires.com.br" },
  { id: "u-gus", fullName: "Gustavo Bismarchi", email: "gustavo@bpplaw.com.br" },
];

const RD_FIELDS = {
  "Email Solicitante": "Ana.Souza@bismarchipires.com.br",
  Solicitante: "Ana Paula Souza",
  "Cadastro realizado por": "leonardo.marques@bismarchipires.com.br",
  "Razão Social [CP]": "RENATO MAROTTA STAREK",
  "CNPJ [CP]": "416.641.008-30",
  "Tipo de Lead": "Indicação",
  "Indicação": "Cliente",
  "Nome da Indicação": "João Cliente",
  "Haverá Due Diligence?": "Não",
  "Local da Reunião": "Escritório Campinas",
  "Data da Reunião": "10/10/2026",
  "Horário da Reunião": "14:30",
  "Áreas que serão objeto de análise": ["Societário e Contratos", "Cível"],
  "Qualificação completa (endereço, CEP, endereço eletrônico etc.) [CP]":
    "Rua das Flores, 100, Centro, Campinas - SP, CEP 13010-000",
  "Áreas Objeto do contrato [CP]": ["Contratos / Societário"],
  "Gestor do Contrato [CP]": "Gustavo Bismarchi",
  "Prazo para entrega [CP]": "20/10/2026",
  "Nome do ponto focal / Comercial [CP]": "Renato Starek",
  "E-mail do ponto focal / Comercial [CP]": "renato@example.com",
  "Telefone do ponto focal / Comercial [CP]": "(19) 99999-0000",
  "Tributação [CP]": "Valor Líquido de Tributos",
  "Link da Proposta [CP]": "https://bpplaw.sharepoint.com/proposta-renato.pdf",
  "Data de assinatura do contrato [CA]": "15/10/2026",
  "Razão Social para Faturamento [FINANCEIRO]": "RENATO MAROTTA STAREK",
  "CPF/CNPJ para Faturamento [FINANCEIRO]": "416.641.008-30",
  "Início da Vigência do Contrato [FINANCEIRO]": "15/10/2026",
  "Primeiro Faturamento [FINANCEIRO]": "20/11/2026",
  "Responsável Financeiro do Cliente [FINANCEIRO]": "Renato Starek",
  "Posição do Responsável (Sócio, Diretor, Gerente...) [FINANCEIRO]": "Sócio",
  "E-mail Responsável Financeiro do Cliente [FINANCEIRO]": "financeiro@example.com",
  "RATEIO - VALOR R$ (Contratos / Societário) - [FINANCEIRO]": "3.000,00",
  "RATEIO - VALOR R$ (Cível) - [FINANCEIRO]": "1000",
  "Índice de Reajuste - [FINANCEIRO]": "IGPM",
  "Periodicidade do Reajuste - [FINANCEIRO]": "Anual",
  "STATUS [FINANCEIRO]": "CONCLUÍDO",
};

const OPP = {
  nome: "RENATO MAROTTA STAREK",
  haveraDueDiligence: false,
  linkProposta: null,
  linkContrato: null,
  d4signDocumentUuid: null,
};

function prefillFor(stage: string, extra: Record<string, string | string[]> = {}): RdMigrationValues {
  const deal = readRdDeal(details({ stage, fields: { ...RD_FIELDS, ...extra } }))!;
  return buildRdMigrationPrefill({
    deal,
    opportunity: OPP,
    users: USERS,
    fieldOptions: { cp_tributacao: ["Valor Liquido de Tributos", "Valor Englobando Tributos"] },
  });
}

function def(partial: Partial<FieldDefinition> & Pick<FieldDefinition, "field_code" | "label" | "stage_code">): FieldDefinition {
  return {
    id: `def-${partial.field_code}`,
    field_type: "text",
    is_required: true,
    condition_json: null,
    field_options: null,
    sort_order: 0,
    pipeline_code: "vendas",
    is_active: true,
    ...partial,
  };
}

const FIELD_DEFS: FieldDefinition[] = [
  def({ field_code: "cp_nome_focal", label: "Nome do ponto focal / Comercial [CP]", stage_code: "confeccao_proposta" }),
  def({ field_code: "cp_email_focal", label: "E-mail do ponto focal / Comercial [CP]", stage_code: "confeccao_proposta", field_type: "email" }),
  def({ field_code: "cp_captador", label: "Captador [CP]", stage_code: "confeccao_proposta", field_type: "user" }),
  def({ field_code: "cp_info_adicionais", label: "Informações adicionais [CP]", stage_code: "confeccao_proposta", is_required: false }),
  def({ field_code: "cp_areas_objeto", label: "Áreas objeto do contrato [CP]", stage_code: "confeccao_proposta" }),
  def({ field_code: "cp_link_proposta", label: "Link da Proposta", stage_code: "proposta_enviada" }),
  def({ field_code: "data_reuniao_due", label: "Data da Reunião", stage_code: "due_diligence_finalizada" }),
  def({ field_code: "cc_tipo_instrumento", label: "Tipo de Instrumento [CC]", stage_code: "confeccao_contrato" }),
];

/** Valores com o bloco da proposta completo (endereço, áreas, escopo, prazo). */
function withPropostaBlock(values: RdMigrationValues): RdMigrationValues {
  return {
    ...values,
    campos: {
      ...values.campos,
      cp_cliente_cep: "13010000",
      cp_cliente_logradouro: "Rua das Flores",
      cp_cliente_numero: "100",
      cp_cliente_cidade: "Campinas",
      cp_areas_objeto: ["Societário e Contratos"],
      cp_escopo_detalhe_json: JSON.stringify({
        "Societário e Contratos": [{ id: "e1", tipoId: "consultivo_societario", subtipoId: "", placeholders: {} }],
      }),
      cp_prazo_entrega: "2026-10-20",
      cp_captador: "u-ana",
    },
  };
}

describe("leitura do negócio do RD", () => {
  it("lê etapa, dono e campos com lista", () => {
    const deal = readRdDeal(details({ stage: "Proposta Enviada (AGUARDA CLIENTE)", fields: RD_FIELDS }))!;
    expect(deal.stageLabel).toBe("Proposta Enviada (AGUARDA CLIENTE)");
    expect(deal.ownerEmail).toBe("leonardo.marques@bismarchipires.com.br");
    expect(deal.fields.get("areas que serao objeto de analise")?.value).toEqual(["Societário e Contratos", "Cível"]);
  });

  it("interpreta datas, endereço, área e rateio do RD", () => {
    expect(parseRdDate("15/10/2026")).toBe("2026-10-15");
    expect(parseRdDate("A definir")).toBe("");
    expect(parseRdDate("31/02/2026")).toBe("");
    expect(parseRdAddress("Rua X, 10 - Campinas/SP - CEP 13.010-000")).toEqual({ cep: "13010000", uf: "SP", multiple: false });
    expect(rdAreaToCrm("Contratos / Societário")).toBe("Societário e Contratos");
    expect(rdAreaToCrm("ADD")).toBeNull();
    const deal = readRdDeal(details({ stage: "Reunião", fields: RD_FIELDS }))!;
    expect(rdRateioPorArea(deal)).toEqual({
      rows: [
        { area: "Societário e Contratos", percentual: "75" },
        { area: "Cível", percentual: "25" },
      ],
      origin: "financeiro",
    });
  });
});

describe("escopo da migração", () => {
  const scope = (stage: string, extra: { win?: boolean | null; encerramento?: string | null; dbStage?: string } = {}) =>
    resolveRdMigrationScope({
      deal: readRdDeal(details({ stage, win: extra.win ?? null, fields: {} })),
      dbStage: (extra.dbStage ?? "cadastro_lead") as never,
      encerramento: extra.encerramento ?? null,
      haveraDueDiligence: false,
    });

  it("migra vendas e pós-venda até Inclusão no Faturamento", () => {
    expect(scope("Proposta Enviada (AGUARDA CLIENTE)")).toMatchObject({ inScope: true, targetStage: "proposta_enviada" });
    expect(scope("Inclusão no Fluxo de Faturamento (FINANCEIRO)", { win: true })).toMatchObject({
      inScope: true,
      targetStage: "inclusao_faturamento",
    });
  });

  it("Contrato Assinado abre o pós-venda e Cadastro do Lead vira Reunião", () => {
    expect(scope("Contrato Assinado (SOLICITANTE)", { win: true })).toMatchObject({
      inScope: true,
      rdStage: "contrato_assinado",
      targetStage: "aguardando_cadastro",
    });
    expect(scope("Cadastro do Lead")).toMatchObject({ inScope: true, targetStage: "reuniao" });
  });

  it("deixa de fora Boas-vindas, etapas sem mapa e perdidos", () => {
    expect(scope("Boas-Vindas (RECEP.)")).toMatchObject({ inScope: false, reason: "etapa_fora" });
    expect(scope("Execução do Serviço")).toMatchObject({ inScope: false, reason: "etapa_fora" });
    expect(scope("Contato Inicial")).toMatchObject({ inScope: false, reason: "etapa_fora" });
    expect(scope("Reunião", { win: false })).toMatchObject({ inScope: false, reason: "perdido" });
    expect(scope("Reunião", { encerramento: "perdido" })).toMatchObject({ inScope: false, reason: "perdido" });
  });
});

describe("responsável", () => {
  const deal = readRdDeal(details({ stage: "Reunião", fields: RD_FIELDS }));

  it("usa o Solicitante do RD pelo e-mail", () => {
    expect(resolveRdMigrationResponsible({ deal, assignedAppUserId: null, users: USERS })).toMatchObject({
      appUserId: "u-ana",
      origem: "solicitante",
    });
  });

  it("cai no dono do RD e depois em ninguém; a escolha do admin vence", () => {
    const semSolicitante = readRdDeal(
      details({ stage: "Reunião", fields: { "Email Solicitante": "ex-colaborador@bismarchipires.com.br" } }),
    );
    expect(resolveRdMigrationResponsible({ deal: semSolicitante, assignedAppUserId: null, users: USERS })).toMatchObject({
      appUserId: "u-leo",
      origem: "dono_rd",
    });
    const semNinguem = readRdDeal(details({ stage: "Reunião", owner: "rd@terceiro.com", fields: {} }));
    expect(resolveRdMigrationResponsible({ deal: semNinguem, assignedAppUserId: null, users: USERS })).toBeNull();
    expect(resolveRdMigrationResponsible({ deal, assignedAppUserId: "u-gus", users: USERS })).toMatchObject({
      appUserId: "u-gus",
      origem: "admin",
    });
  });
});

describe("pré-preenchimento", () => {
  it("leva o cadastro, os campos [CP] e as evidências do RD", () => {
    const v = prefillFor("Proposta Enviada (AGUARDA CLIENTE)");
    expect(v.cadastro.empresas).toEqual([
      { tipo_documento: "CPF", razao_social: "RENATO MAROTTA STAREK", documento: "41664100830" },
    ]);
    expect(v.cadastro).toMatchObject({
      tipoLead: "Indicacao",
      tipoIndicacao: "Cliente",
      nomeIndicacao: "João Cliente",
      dueDiligence: "Nao",
      localReuniao: "Escritório Campinas",
      dataReuniao: "2026-10-10",
      horarioReuniao: "14:30",
      areasAnalise: ["Societário e Contratos", "Cível"],
    });
    expect(v.campos).toMatchObject({
      cp_cliente_cep: "13010000",
      cp_cliente_uf: "SP",
      cp_areas_objeto: ["Societário e Contratos"],
      cp_gestor_contrato: "u-gus",
      cp_prazo_entrega: "2026-10-20",
      cp_nome_focal: "Renato Starek",
      cp_tributacao: "Valor Liquido de Tributos",
    });
    expect(v.campos.cp_captador).toBeUndefined();
    expect(v.evidencias.linkProposta).toBe("https://bpplaw.sharepoint.com/proposta-renato.pdf");
    expect(v.evidencias.dataAssinatura).toBe("2026-10-15");
    expect(v.sources["campos.cp_gestor_contrato"]).toBe("RD: Gestor do Contrato [CP]");
  });

  it("lê a data da reunião e o prazo da proposta com os rótulos que o RD usa", () => {
    const fields = Object.fromEntries(
      Object.entries(RD_FIELDS).filter(([label]) => label !== "Data da Reunião" && label !== "Prazo para entrega [CP]"),
    );
    const deal = readRdDeal(
      details({
        stage: "Proposta Enviada (AGUARDA CLIENTE)",
        fields: {
          ...fields,
          "Data Reunião": "19/02/2026",
          "Prazo para entrega (mínimo de 2 dias úteis - sinalizar exceções e motivos) [CP]": "24/02/2026",
        },
      }),
    )!;
    const v = buildRdMigrationPrefill({ deal, opportunity: OPP, users: USERS, fieldOptions: {} });
    expect(v.cadastro.dataReuniao).toBe("2026-02-19");
    expect(v.campos.cp_prazo_entrega).toBe("2026-02-24");
  });

  it("pré-preenche cadastro do cliente e faturamento com [CADASTRO]/[FINANCEIRO]", () => {
    const { onboarding } = prefillFor("Inclusão no Fluxo de Faturamento (FINANCEIRO)");
    expect(onboarding.cadastro).toMatchObject({ razaoSocial: "RENATO MAROTTA STAREK", documento: "41664100830" });
    expect(onboarding.cadastro.endereco).toMatchObject({ cep: "13010000", uf: "SP" });
    expect(onboarding.financeiro).toMatchObject({
      inicioVigencia: "2026-10-15",
      primeiroFaturamento: "2026-11-20",
      reajuste: { indice: "IGP-M", periodicidadeMeses: "12" },
      contatoFinanceiro: { nome: "Renato Starek", posicao: "Sócio", email: "financeiro@example.com", telefone: "" },
    });
    expect(onboarding.financeiro.rateioPorArea).toHaveLength(2);
    expect(onboarding.sources["financeiro.inicioVigencia"]).toBe("rd");
    expect(onboarding.cadastro).toMatchObject({ email: "renato@example.com", telefone: "(19) 99999-0000" });
    expect(onboarding.sources["cadastro.email"]).toBe("ponto_focal");
  });

  it("primeiro faturamento em texto vira condição", () => {
    const { onboarding } = prefillFor("Inclusão no Fluxo de Faturamento", {
      "Primeiro Faturamento [FINANCEIRO]": "Após a entrega do relatório",
    });
    expect(onboarding.financeiro).toMatchObject({
      primeiroFaturamento: "",
      primeiroFaturamentoCondicionado: true,
      condicaoPrimeiroFaturamento: "Após a entrega do relatório",
    });
  });

  it("rascunho preenchido vale; campo vazio volta ao RD", () => {
    const base = prefillFor("Reunião");
    const draft = { cadastro: { localReuniao: "Online (Teams)", plataforma: "", decisor: "" }, campos: {} };
    const merged = mergeRdMigrationValues(base, draft);
    expect(merged.cadastro.localReuniao).toBe("Online (Teams)");
    expect(merged.cadastro.dataReuniao).toBe("2026-10-10");
    expect(merged.campos.cp_nome_focal).toBe("Renato Starek");
  });
});

describe("pendências por etapa", () => {
  const compute = (stage: string, values: RdMigrationValues, responsibleAppUserId: string | null = "u-ana") =>
    computeRdMigrationRequirements({
      stage: stage as never,
      values,
      fieldDefinitions: FIELD_DEFS,
      responsibleAppUserId,
    });
  const missingKeys = (r: ReturnType<typeof compute>) => r.missing.map((i) => i.key);

  it("Reunião só pede o cadastro do Novo Lead", () => {
    const r = compute("reuniao", prefillFor("Reunião"));
    expect(r.needs).toMatchObject({ proposta: false, linkProposta: null, onboarding: null });
    expect(r.complete).toBe(true);
    expect(r.fieldDefinitions).toEqual([]);
  });

  it("cadastro: Lead Digital exige Plataforma e sem responsável fica pendente", () => {
    const v = prefillFor("Reunião");
    v.cadastro.tipoLead = "Lead Digital";
    const r = compute("reuniao", v, null);
    expect(missingKeys(r)).toEqual(["responsavel", "cadastro.plataforma"]);
  });

  it("Elaboração da proposta pede o bloco da proposta e os [CP] obrigatórios", () => {
    const v = prefillFor("Elaboração da Proposta");
    const r = compute("confeccao_proposta", v);
    expect(missingKeys(r)).toEqual(["proposta.bloco", "campos.cp_captador"]);
    // Reunião (DUE) e link ficam fora: estão no cadastro e em Documentos do RD.
    expect(r.fieldDefinitions.map((d) => d.field_code)).toEqual([
      "cp_nome_focal",
      "cp_email_focal",
      "cp_captador",
      "cp_info_adicionais",
    ]);
    expect(compute("confeccao_proposta", withPropostaBlock(v)).complete).toBe(true);
  });

  it("Proposta Enviada pede o link do RD e o investimento só depois da virada", () => {
    const v = withPropostaBlock(prefillFor("Proposta Enviada"));
    v.evidencias.linkProposta = "";
    const r = compute("proposta_enviada", v);
    expect(missingKeys(r)).toEqual(["evidencias.linkProposta", "investimento"]);
    expect(r.missingBeforeConversion.map((i) => i.key)).toEqual(["evidencias.linkProposta"]);

    v.evidencias.linkProposta = "https://bpplaw.sharepoint.com/p.pdf";
    const ready = compute("proposta_enviada", v);
    expect(ready.readyForConversion).toBe(true);
    expect(ready.complete).toBe(false);

    v.campos.cp_escopo_detalhe_json = JSON.stringify({
      "Societário e Contratos": [{ id: "e1", tipoId: "consultivo_societario", subtipoId: "", placeholders: {} }],
      __investimentoDocumento__: {
        tipoId: "spot",
        subtipoId: "spot_simples",
        placeholders: { VALOR: "12.000,00" },
      },
    });
    expect(compute("proposta_enviada", v).complete).toBe(true);
  });

  it("Contrato Enviado pede links e o documento da D4Sign, sem o bloco da proposta", () => {
    const v = prefillFor("Contrato Enviado");
    const r = compute("contrato_enviado", v);
    expect(r.needs.proposta).toBe(false);
    expect(missingKeys(r)).toEqual(["evidencias.linkContrato", "evidencias.d4signDocumentUuid"]);
  });

  it("pós-venda: Aguardando Cadastro pede a data de assinatura; Faturamento pede o cadastro completo", () => {
    const aguardando = compute("aguardando_cadastro", prefillFor("Aguardando Cadastro"));
    expect(aguardando.needs.onboarding).toBe("draft");
    expect(aguardando.complete).toBe(true);
    expect(aguardando.items.some((i) => i.key === "evidencias.dataAssinatura")).toBe(true);

    const faturamento = compute("inclusao_faturamento", prefillFor("Inclusão no Fluxo de Faturamento"));
    expect(missingKeys(faturamento)).toEqual(["onboarding.logradouro", "onboarding.numero", "onboarding.cidade"]);
  });

  it("necessidades por etapa", () => {
    expect(rdMigrationNeedsForStage("contrato_elaborado")).toMatchObject({
      proposta: true,
      linkProposta: "required",
      linkContrato: "required",
      d4sign: null,
      investimento: true,
    });
    expect(rdMigrationNeedsForStage("cadastro_novo_cliente")).toMatchObject({
      proposta: false,
      d4sign: "optional",
      dataAssinatura: true,
      onboarding: "required",
    });
  });
});

describe("plano de conversão", () => {
  const plan = (rdStage: string, values: RdMigrationValues, etapa = rdStage) => {
    const deal = readRdDeal(details({ stage: "x", win: true, closedAt: "2026-10-15T18:00:00-03:00", fields: RD_FIELDS }));
    const responsible = resolveRdMigrationResponsible({ deal, assignedAppUserId: null, users: USERS });
    const target = rdStage === "contrato_assinado" ? "aguardando_cadastro" : rdStage;
    const requirements = computeRdMigrationRequirements({
      stage: target as never,
      values,
      fieldDefinitions: FIELD_DEFS,
      responsibleAppUserId: responsible?.appUserId ?? null,
    });
    return planRdMigration({
      mode: "convert",
      opportunity: { id: "opp-1", etapa: etapa as never, vendaFechadaEm: null, solicitanteEmail: null },
      rdStage: rdStage as never,
      values,
      requirements,
      responsible,
      deal,
      actorEmail: "admin@bismarchipires.com.br",
      now: "2026-10-25T12:00:00.000Z",
    });
  };

  it("Contrato Assinado vira Aguardando Cadastro com venda ganha e rascunho do contrato", () => {
    const p = plan("contrato_assinado", prefillFor("Contrato Assinado"));
    expect(p.targetStage).toBe("aguardando_cadastro");
    expect(p.opportunityUpdate).toMatchObject({
      etapa: "aguardando_cadastro",
      rd_migrado_em: "2026-10-25T12:00:00.000Z",
      encerramento: "ganho",
      venda_fechada_em: "2026-10-15T21:00:00.000Z",
      solicitante_email: "ana.souza@bismarchipires.com.br",
      link_proposta: "https://bpplaw.sharepoint.com/proposta-renato.pdf",
    });
    expect(p.contract).toEqual({ ensureDraft: true, dataAssinatura: "2026-10-15" });
    expect(p.onboarding?.status).toBe("rascunho");
    expect(p.migrationStatus).toBe("concluida");
    expect(p.intake).toMatchObject({
      solicitante_nome: "Ana Paula Souza",
      cadastrado_por_email: "leonardo.marques@bismarchipires.com.br",
      tipo_lead: "Indicacao",
      tipo_indicacao: "Cliente",
      plataforma: null,
    });
  });

  it("Faturamento com cadastro completo entra com o cadastro concluído", () => {
    const v = prefillFor("Inclusão no Fluxo de Faturamento");
    v.onboarding.cadastro.endereco = { ...v.onboarding.cadastro.endereco, logradouro: "Rua das Flores", numero: "100", cidade: "Campinas" };
    const p = plan("inclusao_faturamento", v);
    expect(p.onboarding?.status).toBe("concluido");
    expect(p.enteredInclusaoFaturamento).toBe(true);
    expect(p.migrationStatus).toBe("concluida");

    const incompleto = plan("inclusao_faturamento", prefillFor("Inclusão no Fluxo de Faturamento"));
    expect(incompleto.onboarding?.status).toBe("rascunho");
    expect(incompleto.migrationStatus).toBe("convertida");
  });

  it("vendas: grava os [CP] com a qualificação montada e não mexe no encerramento", () => {
    const p = plan("proposta_enviada", withPropostaBlock(prefillFor("Proposta Enviada")));
    expect(p.opportunityUpdate.encerramento).toBeUndefined();
    expect(p.contract.ensureDraft).toBe(false);
    expect(p.onboarding).toBeNull();
    const codes = p.fieldValues.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["cp_qualificacao", "cp_proposta_empresas_json", "cp_escopo_detalhe_json"]));
    const qualificacao = p.fieldValues.find((f) => f.code === "cp_qualificacao")?.value as string;
    expect(qualificacao).toContain("RENATO MAROTTA STAREK");
    expect(qualificacao).toContain("13010-000");
    // Investimento só depois da virada: converte, mas fica pendente na fila.
    expect(p.migrationStatus).toBe("convertida");
  });

  it("valores salvos fora do formato voltam ao padrão", () => {
    expect(parseRdMigrationValues({ cadastro: { dueDiligence: "talvez", empresas: "x" } }).cadastro).toMatchObject({
      dueDiligence: "",
      empresas: [],
    });
  });
});
