import { leadTypeLabel } from "@/lib/crm/lead-type-label";
import { getPublicAppBaseUrl } from "@/lib/microsoft-mail/public-app-base-url";
import { escapeHtml } from "./lead-email-interpolate";
import type { NewLeadPayload } from "./new-lead-payload";

export const LEAD_EMAIL_COLORS = {
  dark: "#101F2E",
  gold: "#D5B170",
  bg: "#fcf9f5",
  white: "#fff",
  text: "#333",
  green: "#4CAF50",
  red: "#ff6b6b",
} as const;

export function leadEmailNowSaoPaulo(): { date: string; time: string } {
  const now = new Date();
  const spOffset = -3 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const spDate = new Date(utc + spOffset * 60000);
  return {
    date: spDate.toLocaleDateString("pt-BR"),
    time: spDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function joinLeadEmailEmpresas(empresas: NewLeadPayload["empresas"]): {
  razaoSocial: string;
  cnpj: string;
  razaoSocialPrimeira: string;
} {
  return {
    razaoSocial: empresas.map((e) => e.razao_social).join(", "),
    cnpj: empresas.map((e) => e.documento).join(", "),
    razaoSocialPrimeira: empresas[0]?.razao_social ?? "",
  };
}

export function leadEmailField(label: string, value: string): string {
  const { dark, text } = LEAD_EMAIL_COLORS;
  return `<p style="margin:8px 0;color:${text};line-height:1.5;"><strong style="color:${dark};">${label}:</strong> ${value}</p>`;
}

// ─── E-mail com a identidade do escritório (04/11/2026) ─────────────────────────
// HTML de e-mail: tabelas e estilos inline (Outlook/Gmail ignoram <style>, flex e sombras).

/** Tons da marca usados no e-mail (os mesmos da apresentação comercial). */
export const LEAD_EMAIL_BRAND = {
  navy: "#101F2E",
  gold: "#D5B170",
  goldText: "#8A6A2F",
  cream: "#FCF9F5",
  line: "#EFE6D6",
  page: "#F4F1EC",
  text: "#182230",
  muted: "#667085",
  white: "#FFFFFF",
} as const;

export const LEAD_EMAIL_FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";

/** Logo clara (fundo navy) pela URL pública do CRM; sem URL, o nome do escritório em texto. */
export function leadEmailLogo(): string {
  let base = "";
  try {
    base = getPublicAppBaseUrl().replace(/\/$/, "");
  } catch {
    base = "";
  }
  if (!base) {
    return `<span style="${LEAD_EMAIL_FONT}font-size:18px;font-weight:700;letter-spacing:2px;color:${LEAD_EMAIL_BRAND.white};">BISMARCHI | PIRES</span>`;
  }
  return `<img src="${base}/brand/logo-bismarchi-pires-claro.png" width="200" alt="Bismarchi | Pires Sociedade de Advogados" style="display:block;width:200px;max-width:200px;height:auto;border:0;outline:none;">`;
}

/** Uma linha por empresa/pessoa: nome em destaque e, embaixo, o tipo e o documento. */
export function leadEmailEmpresasLista(empresas: NewLeadPayload["empresas"]): string {
  const B = LEAD_EMAIL_BRAND;
  const itens = empresas.filter((e) => e.razao_social?.trim() || e.documento?.trim());
  if (itens.length === 0) {
    return `<p style="margin:0;${LEAD_EMAIL_FONT}font-size:14px;color:${B.muted};">Não informado</p>`;
  }
  const rows = itens
    .map((e, i) => {
      const pessoa = e.tipo_documento === "CPF";
      const doc = e.documento?.trim() ? `${e.tipo_documento} ${escapeHtml(e.documento.trim())}` : "Documento não informado";
      return `<tr><td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${B.line};` : ""}${LEAD_EMAIL_FONT}">
<p style="margin:0;font-size:15px;line-height:1.4;font-weight:700;color:${B.navy};">${escapeHtml(e.razao_social?.trim() || "Sem nome")}</p>
<p style="margin:2px 0 0;font-size:13px;line-height:1.4;color:${B.muted};">${pessoa ? "Pessoa" : "Empresa"} · ${doc}</p>
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${B.line};border-radius:10px;border-collapse:separate;">${rows}</table>`;
}

/** Áreas como etiquetas (borda dourada). */
export function leadEmailAreaChips(areas: readonly string[]): string {
  const B = LEAD_EMAIL_BRAND;
  const lista = areas.map((a) => String(a).trim()).filter(Boolean);
  if (lista.length === 0) {
    return `<p style="margin:0;${LEAD_EMAIL_FONT}font-size:14px;color:${B.muted};">Não especificado</p>`;
  }
  return lista
    .map(
      (area) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border:1px solid ${B.gold};border-radius:999px;background:${B.cream};${LEAD_EMAIL_FONT}font-size:13px;font-weight:600;color:${B.navy};">${escapeHtml(area)}</span>`,
    )
    .join("");
}

/** Linhas rótulo/valor (tabela de duas colunas). */
export function leadEmailInfoRows(rows: Array<[string, string]>): string {
  const B = LEAD_EMAIL_BRAND;
  const body = rows
    .filter(([, value]) => value.trim())
    .map(
      ([label, value]) => `<tr>
<td width="38%" style="padding:6px 0;vertical-align:top;${LEAD_EMAIL_FONT}font-size:13px;color:${B.muted};">${label}</td>
<td style="padding:6px 0;vertical-align:top;${LEAD_EMAIL_FONT}font-size:14px;font-weight:600;color:${B.text};">${value}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>`;
}

/** Origem do lead: tipo e o que cada tipo traz (indicação, plataforma, áreas do cross selling). */
export function leadEmailOrigemLinhas(
  payload: Pick<NewLeadPayload, "tipo_de_lead" | "tipo_indicacao" | "nome_indicacao"> &
    Partial<Pick<NewLeadPayload, "plataforma" | "area_cross_selling" | "areas_cross_selling">>,
): string {
  const rows: Array<[string, string]> = [["Tipo de lead", escapeHtml(leadTypeLabel(payload.tipo_de_lead) || "Não informado")]];
  if (payload.tipo_de_lead === "Indicacao") {
    rows.push(["Indicação", escapeHtml([payload.tipo_indicacao, payload.nome_indicacao?.trim()].filter(Boolean).join(" · ") || "Não informado")]);
  }
  if (payload.tipo_de_lead === "Lead Digital" && payload.plataforma) rows.push(["Plataforma", escapeHtml(payload.plataforma)]);
  if (payload.tipo_de_lead === "Cross Selling") {
    const areas = [...new Set([...(payload.areas_cross_selling ?? []), ...(payload.area_cross_selling ? [payload.area_cross_selling] : [])])];
    if (areas.length) rows.push(["Áreas do cross selling", escapeHtml(areas.join(", "))]);
  }
  return leadEmailInfoRows(rows);
}
