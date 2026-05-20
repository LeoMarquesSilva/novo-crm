import { formatDateYmdBr } from "@/lib/format-datetime";
import type { NewLeadPayload } from "@/modules/crm/application/services/new-lead-payload";

function fmtDataPt(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "Não informado";
  const s = String(v).trim();
  const br = formatDateYmdBr(s.length >= 10 ? s.slice(0, 10) : s);
  return br || s;
}

interface BuildDueWhatsappMessageInput extends NewLeadPayload {
  razao_social_completa: string;
  cnpj_completo: string;
}

function joinEmpresas(data: BuildDueWhatsappMessageInput, field: "razao_social" | "documento") {
  const values = data.empresas
    .map((empresa) => empresa[field].trim())
    .filter(Boolean);

  if (values.length > 0) return values.join(", ");
  return field === "razao_social" ? data.razao_social_completa : data.cnpj_completo;
}

function buildOrigemLeadSection(data: BuildDueWhatsappMessageInput) {
  const lines = [`*Tipo de Lead:* ${data.tipo_de_lead}`];

  if (data.tipo_de_lead === "Indicacao") {
    lines.push(`*Indicação:* ${data.tipo_indicacao ?? "Não informado"}`);
    lines.push(`*Nome da Indicação:* ${data.nome_indicacao?.trim() || "Não informado"}`);
  }

  if (data.tipo_de_lead === "Cross Selling") {
    const contexto = data.contexto_comercial?.trim();
    lines.push(`*Origem do Cross-selling:* ${contexto || "Cliente da base / relacionamento existente"}`);
  }

  return lines.join("\n");
}

export function buildDueWhatsappMessage(data: BuildDueWhatsappMessageInput) {
  const areas_analise_formatted = data.areas_analise.join(", ");
  const data_reuniao = fmtDataPt(data.data_reuniao);
  const horario_reuniao = data.horario_reuniao || "Não informado";
  const due_date = fmtDataPt(data.data_entrega_due);
  const due_time = data.horario_entrega_due ? ` às ${data.horario_entrega_due}` : "";
  const razoes = joinEmpresas(data, "razao_social");
  const documentos = joinEmpresas(data, "documento");
  const origemLeadSection = buildOrigemLeadSection(data);

  return `
*Novo Lead com Due Diligence*
*Solicitante:* ${data.solicitante}
*Cadastrado por:* ${data.cadastrado_por}
*E-mail:* ${data.email}

*Empresa/Pessoa:* ${razoes || "Não informado"}
*CNPJ/CPF:* ${documentos || "Não informado"}

${origemLeadSection}

*Detalhes da Due Diligence:*
- *Prazo de Entrega:* ${due_date}${due_time}
- *Áreas de Análise:* ${areas_analise_formatted}

*Detalhes da Reunião:*
- *Local:* ${data.local_reuniao}
- *Data:* ${data_reuniao}
- *Horário:* ${horario_reuniao}

*Due Diligence:* ${data.due_diligence}

_Esta mensagem foi gerada automaticamente pelo sistema de Gestão de Leads do Bismarchi | Pires._
`.trim();
}
