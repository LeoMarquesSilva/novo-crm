import { LEAD_EMAIL_BRAND as B, LEAD_EMAIL_FONT as F } from "./lead-email-html-utils";

/**
 * Corpo padrão do e-mail de novo lead com a identidade do escritório (04/11/2026): cabeçalho
 * navy com a logo, fio dourado, destaques, seções e botões que funcionam no Outlook (tabelas e
 * estilos inline). Placeholders `{{chave}}` de `buildLeadEmailHtmlVars`.
 */
export type BrandedLeadEmailVariant = "due" | "sem_due";

function sectionTitle(title: string): string {
  return `<p style="margin:0 0 10px;${F}font-size:11px;line-height:1.4;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${B.goldText};">${title}</p>`;
}

function section(title: string, body: string): string {
  return `<tr><td style="padding:0 32px 24px;">${sectionTitle(title)}${body}</td></tr>`;
}

function highlight(label: string, value: string, sub = ""): string {
  return `<p style="margin:0;${F}font-size:11px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:${B.goldText};">${label}</p>
<p style="margin:4px 0 0;${F}font-size:16px;line-height:1.35;font-weight:700;color:${B.navy};">${value}</p>${
    sub ? `<p style="margin:2px 0 0;${F}font-size:13px;line-height:1.4;color:${B.muted};">${sub}</p>` : ""
  }`;
}

function button(href: string, label: string, kind: "primary" | "gold"): string {
  const bg = kind === "primary" ? B.navy : B.gold;
  const color = kind === "primary" ? B.white : B.navy;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 8px 0;"><tr>
<td bgcolor="${bg}" style="border-radius:8px;background:${bg};"><a href="${href}" target="_blank" style="display:inline-block;padding:12px 22px;${F}font-size:14px;font-weight:700;color:${color};text-decoration:none;border-radius:8px;">${label}</a></td>
</tr></table>`;
}

function steps(items: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      ([title, text], i) => `<tr>
<td width="28" style="padding:6px 0;vertical-align:top;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:999px;background:${B.navy};color:${B.gold};${F}font-size:12px;font-weight:700;text-align:center;">${i + 1}</span></td>
<td style="padding:6px 0 6px 8px;vertical-align:top;${F}font-size:14px;line-height:1.5;color:${B.text};"><strong style="color:${B.navy};">${title}</strong> · ${text}</td>
</tr>`,
    )
    .join("")}</table>`;
}

export function brandedLeadEmailHtml(variant: BrandedLeadEmailVariant): string {
  const due = variant === "due";
  const tag = due ? "Novo lead · Due diligence" : "Novo lead";
  const highlights = due
    ? `<td width="50%" style="padding:14px 16px;vertical-align:top;">${highlight("Prazo da due diligence", "{{prazo_entrega_due}}")}</td>
<td width="50%" style="padding:14px 16px;vertical-align:top;border-left:1px solid ${B.line};">${highlight("Reunião", "{{reuniao_data_horario_sem}}", "{{local_reuniao}}")}</td>`
    : `<td style="padding:14px 16px;vertical-align:top;">${highlight("Reunião", "{{reuniao_data_horario_sem}}", "{{local_reuniao}}")}</td>`;
  const proximosPassos = due
    ? steps([
        ["Abertura de pasta", "o robô abre a pasta de atendimento no VIOS"],
        ["Agendamentos no VIOS", "o robô agenda os prazos e os responsáveis das áreas"],
        ["Levantamento", "coletar os documentos e as informações de cada área"],
      ])
    : steps([
        ["Preparação para a reunião", "pesquisar informações preliminares sobre o cliente"],
        ["Material de apoio", "apresentação institucional e cases da área"],
        ["Proposta", "preencher no CRM os campos para a confecção da proposta"],
      ]);
  // A abertura de pasta é automática (robô do SAMA, 13/11/2026): saiu o botão do Power Apps do CRM antigo.
  const botoes = button("{{link_lead}}", "Abrir lead no CRM", "primary");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${B.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${B.white};border:1px solid ${B.line};border-radius:12px;border-collapse:separate;overflow:hidden;">
<tr><td style="background:${B.navy};padding:24px 32px;border-radius:12px 12px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;">{{logo_html}}</td>
<td align="right" style="vertical-align:middle;${F}font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${B.gold};">CRM</td>
</tr></table>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${B.gold};">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 4px;">
<p style="margin:0 0 6px;${F}font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${B.goldText};">${tag}</p>
<h1 style="margin:0;${F}font-size:22px;line-height:1.3;font-weight:700;color:${B.navy};">{{razao_social_primeira}}</h1>
<p style="margin:8px 0 0;${F}font-size:13px;line-height:1.5;color:${B.muted};">{{tipo_de_lead}} · cadastrado em {{data_hora_cadastro}}</p>
</td></tr>
<tr><td style="padding:18px 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${B.cream};border:1px solid ${B.line};border-radius:10px;border-collapse:separate;"><tr>
${highlights}
</tr></table>
</td></tr>
${section("Empresas e pessoas", "{{empresas_lista}}")}
${section("Áreas de análise", "{{areas_chips}}")}
${section("Origem do lead", "{{origem_linhas}}")}
${section(
  "Captador",
  `<p style="margin:0;${F}font-size:15px;line-height:1.4;font-weight:700;color:${B.navy};">{{solicitante}}</p>
<p style="margin:2px 0 0;${F}font-size:13px;line-height:1.4;color:${B.muted};">{{captador_contato}}</p>`,
)}
${section("Próximos passos", proximosPassos)}
<tr><td style="padding:4px 32px 28px;">${botoes}</td></tr>
<tr><td style="background:${B.navy};padding:18px 32px;border-radius:0 0 12px 12px;">
<p style="margin:0;${F}font-size:12px;line-height:1.6;color:${B.gold};font-weight:700;">Bismarchi | Pires Sociedade de Advogados</p>
<p style="margin:2px 0 0;${F}font-size:12px;line-height:1.6;color:#C9D1DB;">Rua Coronel Quirino, 1266 · Cambuí · Campinas/SP</p>
<p style="margin:8px 0 0;${F}font-size:11px;line-height:1.5;color:#8C99A8;">E-mail automático do CRM. Não responda esta mensagem.</p>
</td></tr>
</table>
</td></tr>
</table>`;
}
