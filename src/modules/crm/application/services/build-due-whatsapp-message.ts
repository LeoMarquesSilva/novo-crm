import { formatDateYmdBr } from "@/lib/format-datetime";
import type { NewLeadPayload } from "@/modules/crm/application/services/new-lead-payload";
import {
  WHATSAPP_TEMPLATE_DEFS,
  renderWhatsappTemplate,
  type WhatsappTemplateValues,
} from "@/lib/crm/whatsapp/templates";

function fmtDataPt(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "Não informado";
  const s = String(v).trim();
  const br = formatDateYmdBr(s.length >= 10 ? s.slice(0, 10) : s);
  return br || s;
}

export interface BuildDueWhatsappMessageInput extends NewLeadPayload {
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

/**
 * Valores do modelo `novo_lead_due` (texto padrão e versão editável em Integrações → WhatsApp).
 * `avisos`: alerta de área sem responsável no cadastro de usuários (vazio quando está tudo certo).
 */
export function buildDueWhatsappValues(
  data: BuildDueWhatsappMessageInput,
  avisos?: string | null,
): WhatsappTemplateValues {
  const due_time = data.horario_entrega_due ? ` às ${data.horario_entrega_due}` : "";
  return {
    solicitante: data.solicitante,
    cadastrado_por: data.cadastrado_por,
    email: data.email,
    empresas: joinEmpresas(data, "razao_social") || "Não informado",
    documentos: joinEmpresas(data, "documento") || "Não informado",
    origem: buildOrigemLeadSection(data),
    prazo_due: `${fmtDataPt(data.data_entrega_due)}${due_time}`,
    areas: data.areas_analise.join(", "),
    reuniao_local: data.local_reuniao,
    reuniao_data: fmtDataPt(data.data_reuniao),
    reuniao_horario: data.horario_reuniao || "Não informado",
    due_diligence: data.due_diligence,
    avisos: avisos ?? "",
  };
}

/** Texto padrão (sem a sobrescrita do banco), usado em testes e quando não há Supabase à mão. */
export function buildDueWhatsappMessage(data: BuildDueWhatsappMessageInput) {
  return renderWhatsappTemplate(
    WHATSAPP_TEMPLATE_DEFS.novo_lead_due.defaultBody,
    buildDueWhatsappValues(data),
  );
}
