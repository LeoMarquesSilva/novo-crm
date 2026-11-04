import { formatDateYmdBr } from "@/lib/format-datetime";
import { leadTypeLabel } from "@/lib/crm/lead-type-label";
import type { NewLeadPayload } from "@/modules/crm/application/services/new-lead-payload";
import {
  WHATSAPP_TEMPLATE_DEFS,
  renderWhatsappTemplate,
  type WhatsappTemplateKey,
  type WhatsappTemplateValues,
} from "@/lib/crm/whatsapp/templates";

function fmtDataPt(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "Não informado";
  const s = String(v).trim();
  const br = formatDateYmdBr(s.length >= 10 ? s.slice(0, 10) : s);
  return br || s;
}

/** `18:00:00` (como o banco devolve) → `18:00`. */
function fmtHora(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  return /^\d{2}:\d{2}:\d{2}$/.test(s) ? s.slice(0, 5) : s;
}

export interface BuildDueWhatsappMessageInput
  extends Omit<NewLeadPayload, "area_cross_selling" | "areas_cross_selling"> {
  razao_social_completa: string;
  cnpj_completo: string;
  /** Área do cross-selling: uma (formato antigo) ou várias. */
  area_cross_selling?: string | string[] | null;
  /** Áreas do cross-selling (formato multiárea); somadas a `area_cross_selling`, sem repetir. */
  areas_cross_selling?: string[] | null;
}

/** Modelo do aviso de lead novo no grupo da DUE: com due diligence `novo_lead_due`, sem `novo_lead`. */
export function newLeadWhatsappTemplateKey(
  data: Pick<NewLeadPayload, "due_diligence">,
): Extract<WhatsappTemplateKey, "novo_lead" | "novo_lead_due"> {
  return data.due_diligence === "Sim" ? "novo_lead_due" : "novo_lead";
}

/** Áreas do cross-selling, na ordem informada, sem vazias nem repetidas. */
export function crossSellingAreas(
  data: Pick<BuildDueWhatsappMessageInput, "area_cross_selling" | "areas_cross_selling">,
): string[] {
  const single = data.area_cross_selling;
  const fromSingle = single == null ? [] : typeof single === "string" ? [single] : single;
  const all = [...fromSingle, ...(data.areas_cross_selling ?? [])];
  return [...new Set(all.map((area) => String(area ?? "").trim()).filter(Boolean))];
}

function joinEmpresas(data: BuildDueWhatsappMessageInput, field: "razao_social" | "documento") {
  const values = data.empresas
    .map((empresa) => empresa[field].trim())
    .filter(Boolean);

  if (values.length > 0) return values.join(", ");
  return field === "razao_social" ? data.razao_social_completa : data.cnpj_completo;
}

/** Uma linha de lista por empresa/pessoa: nome em negrito e o documento ao lado (04/11/2026). */
function buildEmpresasLista(data: BuildDueWhatsappMessageInput): string {
  const itens = data.empresas.filter((empresa) => empresa.razao_social.trim() || empresa.documento.trim());
  if (itens.length === 0) {
    const nome = data.razao_social_completa?.trim();
    const doc = data.cnpj_completo?.trim();
    return nome || doc ? `- *${nome || "Sem nome"}*${doc ? ` · ${doc}` : ""}` : "- Não informado";
  }
  return itens
    .map((empresa) => {
      const doc = empresa.documento.trim();
      return `- *${empresa.razao_social.trim() || "Sem nome"}*${doc ? ` · ${empresa.tipo_documento} ${doc}` : ""}`;
    })
    .join("\n");
}

/** Origem do lead em itens de lista do WhatsApp ("- *Rótulo:* valor"). */
function buildOrigemLeadSection(data: BuildDueWhatsappMessageInput) {
  // Rótulo, não a chave gravada ("Indicacao" saía assim no teste ponta a ponta 4).
  const lines = [`- *Tipo:* ${leadTypeLabel(data.tipo_de_lead)}`];

  if (data.tipo_de_lead === "Indicacao") {
    lines.push(`- *Indicação:* ${data.tipo_indicacao ?? "Não informado"}`);
    lines.push(`- *Nome da indicação:* ${data.nome_indicacao?.trim() || "Não informado"}`);
  }

  if (data.tipo_de_lead === "Lead Digital" && data.plataforma) {
    lines.push(`- *Plataforma:* ${data.plataforma}`);
  }

  if (data.tipo_de_lead === "Cross Selling") {
    const areas = crossSellingAreas(data);
    if (areas.length > 0) {
      lines.push(`- *${areas.length > 1 ? "Áreas" : "Área"} do cross-selling:* ${areas.join(", ")}`);
    }
    const contexto = data.contexto_comercial?.trim();
    lines.push(`- *Origem do cross-selling:* ${contexto || "Cliente da base / relacionamento existente"}`);
  }

  return lines.join("\n");
}

/** E-mail do captador e, só quando foi outra pessoa, quem cadastrou. */
function buildCaptadorContato(data: BuildDueWhatsappMessageInput): string {
  const email = data.email?.trim() ?? "";
  const cadastro = data.cadastrado_por?.trim() ?? "";
  const outraPessoa = cadastro && cadastro.toLowerCase() !== email.toLowerCase();
  return [email, outraPessoa ? `cadastrado por ${cadastro}` : ""].filter(Boolean).join(" · ");
}

/** Data e hora em Brasília, como "04/11/2026 às 14:30". */
function dataHoraBrasilia(now: Date): string {
  const tz = { timeZone: "America/Sao_Paulo" } as const;
  const data = new Intl.DateTimeFormat("pt-BR", { ...tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const hora = new Intl.DateTimeFormat("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" }).format(now);
  return `${data} às ${hora}`;
}

/** "27/10/2026 às 12:00"; sem data, "A definir"; sem horário, só a data. */
function reuniaoQuando(data: BuildDueWhatsappMessageInput): string {
  const dia = data.data_reuniao?.trim() ? fmtDataPt(data.data_reuniao) : "";
  const hora = fmtHora(data.horario_reuniao);
  if (!dia) return hora ? `Horário ${hora}, data a definir` : "A definir";
  return hora ? `${dia} às ${hora}` : dia;
}

/**
 * Valores dos modelos `novo_lead` e `novo_lead_due` (texto padrão e versão editável em Integrações → WhatsApp).
 * `novo_lead` não usa `prazo_due` nem `avisos`.
 * `avisos`: alerta de área sem responsável no cadastro de usuários (vazio quando está tudo certo).
 * `extras.link`: ficha do lead no CRM (só endereço absoluto; sem ele a linha some).
 * Os placeholders antigos (`empresas`, `documentos`, `reuniao_data`…) continuam para modelos personalizados.
 */
export function buildDueWhatsappValues(
  data: BuildDueWhatsappMessageInput,
  avisos?: string | null,
  extras: { link?: string | null; now?: Date } = {},
): WhatsappTemplateValues {
  const due_time = data.horario_entrega_due ? ` às ${fmtHora(data.horario_entrega_due)}` : "";
  const link = extras.link?.trim() ?? "";
  return {
    empresas_lista: buildEmpresasLista(data),
    captador_contato: buildCaptadorContato(data),
    data_cadastro: dataHoraBrasilia(extras.now ?? new Date()),
    reuniao_quando: reuniaoQuando(data),
    link: /^https?:\/\//.test(link) ? link : "",
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
    reuniao_horario: fmtHora(data.horario_reuniao) || "Não informado",
    due_diligence: data.due_diligence === "Sim" ? "Sim" : "Não",
    avisos: avisos ?? "",
  };
}

/**
 * Texto padrão (sem a sobrescrita do banco), usado em testes e quando não há Supabase à mão.
 * Escolhe o modelo como o envio: `novo_lead_due` com due diligence, `novo_lead` sem.
 */
export function buildDueWhatsappMessage(
  data: BuildDueWhatsappMessageInput,
  extras: { avisos?: string | null; link?: string | null; now?: Date } = {},
) {
  return renderWhatsappTemplate(
    WHATSAPP_TEMPLATE_DEFS[newLeadWhatsappTemplateKey(data)].defaultBody,
    buildDueWhatsappValues(data, extras.avisos, extras),
  );
}
