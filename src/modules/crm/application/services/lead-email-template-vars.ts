import type { NewLeadPayload } from "./new-lead-payload";
import { escapeHtml } from "./lead-email-interpolate";
import {
  joinLeadEmailEmpresas,
  leadEmailField,
  leadEmailNowSaoPaulo,
} from "./lead-email-html-utils";

export type LeadEmailTemplatePayload = Pick<
  NewLeadPayload,
  | "solicitante"
  | "email"
  | "cadastrado_por"
  | "empresas"
  | "areas_analise"
  | "local_reuniao"
  | "data_reuniao"
  | "horario_reuniao"
  | "data_entrega_due"
  | "horario_entrega_due"
  | "tipo_de_lead"
  | "tipo_indicacao"
  | "nome_indicacao"
  | "due_diligence"
>;

function plainOneLine(s: string): string {
  return s.replace(/\r?\n/g, " ").trim();
}

/** Valores escapados para interpolação no corpo HTML. */
export function buildLeadEmailHtmlVars(payload: LeadEmailTemplatePayload): Record<string, string> {
  const { razaoSocial, cnpj, razaoSocialPrimeira } = joinLeadEmailEmpresas(payload.empresas);
  const { date, time } = leadEmailNowSaoPaulo();
  const areas = Array.isArray(payload.areas_analise)
    ? payload.areas_analise.join(", ")
    : (payload.areas_analise ?? "Não especificado");

  const nomeInd = payload.nome_indicacao?.trim() ?? "";
  const tipoInd = payload.tipo_indicacao ?? "";

  const fragNomeIndicacaoDue = nomeInd
    ? leadEmailField("Indicação", escapeHtml(nomeInd))
    : "";
  const fragTipoIndicacaoDue = tipoInd
    ? leadEmailField("Tipo de Indicação", escapeHtml(String(tipoInd)))
    : "";
  const fragNomeIndicacaoSem = nomeInd
    ? leadEmailField("Nome da Indicação", escapeHtml(nomeInd))
    : "";
  const fragTipoIndicacaoSem = tipoInd
    ? leadEmailField("Tipo de Indicação", escapeHtml(String(tipoInd)))
    : "";

  const prazoEntrega =
    `${payload.data_entrega_due || "Não informado"}` +
    (payload.horario_entrega_due ? ` às ${payload.horario_entrega_due}` : "");

  const reuniaoDataHorarioSem = payload.data_reuniao
    ? `${payload.data_reuniao}${payload.horario_reuniao ? ` às ${payload.horario_reuniao}` : ""}`
    : "A definir";

  return {
    solicitante: escapeHtml(payload.solicitante || "Não informado"),
    email: escapeHtml(payload.email || "Não informado"),
    cadastrado_por: escapeHtml(payload.cadastrado_por || "Não informado"),
    razao_social: escapeHtml(razaoSocial || "Não informado"),
    cnpj: escapeHtml(cnpj || "Não informado"),
    razao_social_primeira: escapeHtml(razaoSocialPrimeira || razaoSocial || "Não informado"),
    tipo_de_lead: escapeHtml(payload.tipo_de_lead || "Não informado"),
    areas: escapeHtml(areas),
    data_hora_cadastro: escapeHtml(`${date} às ${time}`),
    data_entrega_due: escapeHtml(payload.data_entrega_due || "Não informado"),
    horario_entrega_due: escapeHtml(payload.horario_entrega_due || ""),
    prazo_entrega_due: escapeHtml(prazoEntrega),
    local_reuniao: escapeHtml(payload.local_reuniao || "Não informado"),
    data_reuniao: escapeHtml(payload.data_reuniao || "Não informado"),
    horario_reuniao: escapeHtml(payload.horario_reuniao || "Não informado"),
    reuniao_data_horario_sem: escapeHtml(reuniaoDataHorarioSem),
    frag_nome_indicacao_due: fragNomeIndicacaoDue,
    frag_tipo_indicacao_due: fragTipoIndicacaoDue,
    frag_nome_indicacao_sem: fragNomeIndicacaoSem,
    frag_tipo_indicacao_sem: fragTipoIndicacaoSem,
  };
}

/** Texto plano para o assunto (sem entidades HTML). */
export function buildLeadEmailSubjectVars(payload: LeadEmailTemplatePayload): Record<string, string> {
  const { razaoSocial, cnpj, razaoSocialPrimeira } = joinLeadEmailEmpresas(payload.empresas);
  const { date, time } = leadEmailNowSaoPaulo();
  const areas = Array.isArray(payload.areas_analise)
    ? payload.areas_analise.join(", ")
    : (payload.areas_analise ?? "Não especificado");

  const emptyFrags = {
    frag_nome_indicacao_due: "",
    frag_tipo_indicacao_due: "",
    frag_nome_indicacao_sem: "",
    frag_tipo_indicacao_sem: "",
  };

  const prazoEntrega =
    `${payload.data_entrega_due || "Não informado"}` +
    (payload.horario_entrega_due ? ` às ${payload.horario_entrega_due}` : "");

  const reuniaoDataHorarioSem = payload.data_reuniao
    ? `${payload.data_reuniao}${payload.horario_reuniao ? ` às ${payload.horario_reuniao}` : ""}`
    : "A definir";

  return {
    solicitante: plainOneLine(payload.solicitante || "Não informado"),
    email: plainOneLine(payload.email || "Não informado"),
    cadastrado_por: plainOneLine(payload.cadastrado_por || "Não informado"),
    razao_social: plainOneLine(razaoSocial || "Não informado"),
    cnpj: plainOneLine(cnpj || "Não informado"),
    razao_social_primeira: plainOneLine(razaoSocialPrimeira || razaoSocial || "Não informado"),
    tipo_de_lead: plainOneLine(payload.tipo_de_lead || "Não informado"),
    areas: plainOneLine(areas),
    data_hora_cadastro: plainOneLine(`${date} às ${time}`),
    data_entrega_due: plainOneLine(payload.data_entrega_due || "Não informado"),
    horario_entrega_due: plainOneLine(payload.horario_entrega_due || ""),
    prazo_entrega_due: plainOneLine(prazoEntrega),
    local_reuniao: plainOneLine(payload.local_reuniao || "Não informado"),
    data_reuniao: plainOneLine(payload.data_reuniao || "Não informado"),
    horario_reuniao: plainOneLine(payload.horario_reuniao || "Não informado"),
    reuniao_data_horario_sem: plainOneLine(reuniaoDataHorarioSem),
    ...emptyFrags,
  };
}

/** Payload de exemplo para pré-visualização no admin (válido para due e sem due). */
export const SAMPLE_LEAD_EMAIL_PAYLOAD: LeadEmailTemplatePayload = {
  solicitante: "Maria Exemplo",
  email: "maria.exemplo@cliente.com.br",
  cadastrado_por: "comercial@bismarchipires.com.br",
  due_diligence: "Sim",
  data_entrega_due: "2026-05-15",
  horario_entrega_due: "18:00",
  empresas: [
    { tipo_documento: "CNPJ", razao_social: "Empresa Demonstração Ltda", documento: "12.345.678/0001-90" },
  ],
  areas_analise: ["Cível", "Tributário"],
  local_reuniao: "Escritório — Sala 3",
  data_reuniao: "2026-05-20",
  horario_reuniao: "14:30",
  tipo_de_lead: "Indicacao",
  tipo_indicacao: "Cliente",
  nome_indicacao: "João Indicador",
};

export const SAMPLE_LEAD_EMAIL_PAYLOAD_SEM_DUE: LeadEmailTemplatePayload = {
  ...SAMPLE_LEAD_EMAIL_PAYLOAD,
  due_diligence: "Nao",
  data_entrega_due: null,
  horario_entrega_due: null,
};

/** Chaves `{{...}}` nos modelos. No HTML os valores são escapados; no assunto, texto plano. */
export const LEAD_EMAIL_TEMPLATE_PLACEHOLDER_KEYS = [
  "solicitante",
  "email",
  "cadastrado_por",
  "razao_social",
  "cnpj",
  "razao_social_primeira",
  "tipo_de_lead",
  "areas",
  "data_hora_cadastro",
  "data_entrega_due",
  "horario_entrega_due",
  "prazo_entrega_due",
  "local_reuniao",
  "data_reuniao",
  "horario_reuniao",
  "reuniao_data_horario_sem",
  "frag_nome_indicacao_due",
  "frag_tipo_indicacao_due",
  "frag_nome_indicacao_sem",
  "frag_tipo_indicacao_sem",
] as const;
