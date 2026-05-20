import { formatDateYmdBr } from "@/lib/format-datetime";
import type { NewLeadPayload } from "@/modules/crm/application/services/new-lead-payload";

export type SharePointAgendamentoFields = Record<string, string | number | boolean | null>;

function joinCompanies(payload: NewLeadPayload): string {
  return payload.empresas
    .map((empresa) => `${empresa.razao_social.trim()} - ${empresa.documento.trim()}`)
    .filter((item) => item !== " - ")
    .join("\n");
}

function joinRazoes(payload: NewLeadPayload): string {
  return payload.empresas
    .map((empresa) => empresa.razao_social.trim())
    .filter(Boolean)
    .join(", ");
}

function joinDocumentos(payload: NewLeadPayload): string {
  return payload.empresas
    .map((empresa) => empresa.documento.trim())
    .filter(Boolean)
    .join(", ");
}

function formatDateForSharePoint(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  return trimmed;
}

export function buildDueSharePointAgendamentoFields(
  payload: NewLeadPayload,
): SharePointAgendamentoFields {
  const razoes = joinRazoes(payload) || "Não informado";
  const documentos = joinDocumentos(payload) || "Não informado";
  const empresas = joinCompanies(payload) || "Não informado";
  const areas = payload.areas_analise.join(", ") || "Não especificado";
  const prazoDue = formatDateForSharePoint(payload.data_entrega_due);
  const prazoDueBr = formatDateYmdBr(prazoDue) || payload.data_entrega_due || "Não informado";
  const indicacao = [payload.tipo_indicacao, payload.nome_indicacao]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(" - ");

  return {
    DEMANDADERISCO: false,
    PROCESSO: `DUE DILIGENCE - ${razoes}`,
    DESCRI_x00c7__x00c3_ODOPRAZO: `DUE DILIGENCE - ${razoes} - CPF/CNPJ - ${documentos}`,
    Tipo_x0020_de_x0020_Agendamento_: "Serviço",
    PRIORIDADE_x0020_DE_x0020_AGENDA: "ESTRATÉGIA PROCESSUAL",
    TIPO_x0020_DE_x0020_A_x00c7__x00: "Due Diligence Prospect",
    CLIENTE: "BISMARCHI, PIRES E PECCININ SOCIEDADE DE ADVOGADOS",
    DATA_x002d_ENVIAR: prazoDue,
    Status: "Pendente",
    DEPARTAMENTO: "COMERCIAL",
    _x00c1_REA_x0020__x002f__x0020_E: "COMERCIAL",
    ENVIAR: payload.cadastrado_por.trim(),
    Title: `DUE DILIGENCE - ${razoes}`,
    MOTIVO_x0020__x002f__x0020_OBSER: [
      `ÁREAS NECESSÁRIAS: ${areas}`,
      `Indicação: ${indicacao || "Não informado"}`,
      "",
      "Empresas do Grupo e CNPJ:",
      empresas,
      "",
      `Prazo de entrega da Due: ${prazoDueBr}${payload.horario_entrega_due ? ` às ${payload.horario_entrega_due}` : ""}`,
      `Solicitante: ${payload.solicitante}`,
      `E-mail do solicitante: ${payload.email}`,
      "",
      "AGENDAMENTOS",
      "Enviar:",
      "Cível/Rec. Cred: Gabriela Consul",
      "Trabalhista: Renato",
      "Tributário: Francisco Zanin",
      "Insolvência: Lucas Sebinel",
      "",
      "Protocolo:",
      "Vincular todos os responsáveis acima em um único agendamento.",
    ].join("\n"),
  };
}
