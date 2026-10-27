import { leadTypeLabel } from "@/lib/crm/lead-type-label";
import { formatDateYmdBr } from "@/lib/format-datetime";
import type { NewLeadPayload } from "./new-lead-payload";
import { escapeHtml } from "./lead-email-interpolate";
import {
  joinLeadEmailEmpresas,
  leadEmailField,
  leadEmailNowSaoPaulo,
} from "./lead-email-html-utils";

export type LeadEmailTemplatePayload = LeadEmailTemplateFields & {
  /** URL absoluta da ficha do lead no CRM (`{{link_lead}}`). Sem ela, a lista de leads. */
  lead_url?: string | null;
};

type LeadEmailTemplateFields = Pick<
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

/** `2026-05-15` → `15/05/2026`; outro texto passa como veio. */
function dataBr(v: string | null | undefined): string {
  const t = v?.trim() ?? "";
  return formatDateYmdBr(t) || t;
}

/** `18:00:00` → `18:00` (o banco devolve com segundos). */
function horaBr(v: string | null | undefined): string {
  return (v?.trim() ?? "").replace(/^(\d{2}:\d{2}):\d{2}$/, "$1");
}

/** Datas e horários do cadastro já no formato do e-mail (iguais no HTML e no assunto). */
function datasDoLead(payload: LeadEmailTemplatePayload) {
  const dataEntrega = dataBr(payload.data_entrega_due);
  const horaEntrega = horaBr(payload.horario_entrega_due);
  const dataReuniao = dataBr(payload.data_reuniao);
  const horaReuniao = horaBr(payload.horario_reuniao);
  return {
    dataEntrega,
    horaEntrega,
    dataReuniao,
    horaReuniao,
    prazoEntrega: `${dataEntrega || "Não informado"}${horaEntrega ? ` às ${horaEntrega}` : ""}`,
    reuniaoDataHorarioSem: dataReuniao
      ? `${dataReuniao}${horaReuniao ? ` às ${horaReuniao}` : ""}`
      : "A definir",
  };
}

/** Destino dos botões do e-mail: a ficha do lead no CRM (não mais o RD Station). */
function leadLink(payload: LeadEmailTemplatePayload): string {
  return payload.lead_url?.trim() || "/crm/leads";
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

  const d = datasDoLead(payload);

  return {
    solicitante: escapeHtml(payload.solicitante || "Não informado"),
    email: escapeHtml(payload.email || "Não informado"),
    cadastrado_por: escapeHtml(payload.cadastrado_por || "Não informado"),
    razao_social: escapeHtml(razaoSocial || "Não informado"),
    cnpj: escapeHtml(cnpj || "Não informado"),
    razao_social_primeira: escapeHtml(razaoSocialPrimeira || razaoSocial || "Não informado"),
    tipo_de_lead: escapeHtml(leadTypeLabel(payload.tipo_de_lead) || "Não informado"),
    areas: escapeHtml(areas),
    data_hora_cadastro: escapeHtml(`${date} às ${time}`),
    data_entrega_due: escapeHtml(d.dataEntrega || "Não informado"),
    horario_entrega_due: escapeHtml(d.horaEntrega),
    prazo_entrega_due: escapeHtml(d.prazoEntrega),
    local_reuniao: escapeHtml(payload.local_reuniao || "Não informado"),
    data_reuniao: escapeHtml(d.dataReuniao || "Não informado"),
    horario_reuniao: escapeHtml(d.horaReuniao || "Não informado"),
    reuniao_data_horario_sem: escapeHtml(d.reuniaoDataHorarioSem),
    link_lead: escapeHtml(leadLink(payload)),
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

  const d = datasDoLead(payload);

  return {
    solicitante: plainOneLine(payload.solicitante || "Não informado"),
    email: plainOneLine(payload.email || "Não informado"),
    cadastrado_por: plainOneLine(payload.cadastrado_por || "Não informado"),
    razao_social: plainOneLine(razaoSocial || "Não informado"),
    cnpj: plainOneLine(cnpj || "Não informado"),
    razao_social_primeira: plainOneLine(razaoSocialPrimeira || razaoSocial || "Não informado"),
    tipo_de_lead: plainOneLine(leadTypeLabel(payload.tipo_de_lead) || "Não informado"),
    areas: plainOneLine(areas),
    data_hora_cadastro: plainOneLine(`${date} às ${time}`),
    data_entrega_due: plainOneLine(d.dataEntrega || "Não informado"),
    horario_entrega_due: plainOneLine(d.horaEntrega),
    prazo_entrega_due: plainOneLine(d.prazoEntrega),
    local_reuniao: plainOneLine(payload.local_reuniao || "Não informado"),
    data_reuniao: plainOneLine(d.dataReuniao || "Não informado"),
    horario_reuniao: plainOneLine(d.horaReuniao || "Não informado"),
    reuniao_data_horario_sem: plainOneLine(d.reuniaoDataHorarioSem),
    link_lead: plainOneLine(leadLink(payload)),
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
  lead_url: "https://crm.exemplo.com.br/crm/leads/00000000-0000-4000-8000-000000000000",
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
  "link_lead",
  "frag_nome_indicacao_due",
  "frag_tipo_indicacao_due",
  "frag_nome_indicacao_sem",
  "frag_tipo_indicacao_sem",
] as const;
