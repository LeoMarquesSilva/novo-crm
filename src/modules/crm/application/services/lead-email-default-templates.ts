import { brandedLeadEmailHtml } from "./lead-email-branded-template";
import { interpolateLeadEmailTemplate } from "./lead-email-interpolate";
import type { LeadEmailTemplatePayload } from "./lead-email-template-vars";
import { buildLeadEmailHtmlVars, buildLeadEmailSubjectVars } from "./lead-email-template-vars";

/** Assunto padrão — com due diligence */
export const DEFAULT_DUE_SUBJECT_TEMPLATE = "Novo lead com due diligence · {{razao_social_primeira}}";

/** HTML padrão — com due diligence (placeholders {{chave}}); layout em lead-email-branded-template.ts */
export const DEFAULT_DUE_HTML_TEMPLATE = brandedLeadEmailHtml("due");

/** Assunto padrão — sem due */
export const DEFAULT_SEM_DUE_SUBJECT_TEMPLATE = "Novo lead · {{razao_social_primeira}}";

export const DEFAULT_SEM_DUE_HTML_TEMPLATE = brandedLeadEmailHtml("sem_due");

export type LeadEmailVariant = "due" | "sem_due";

export function getDefaultTemplatesForVariant(variant: LeadEmailVariant): {
  subjectTemplate: string;
  htmlTemplate: string;
} {
  if (variant === "due") {
    return { subjectTemplate: DEFAULT_DUE_SUBJECT_TEMPLATE, htmlTemplate: DEFAULT_DUE_HTML_TEMPLATE };
  }
  return { subjectTemplate: DEFAULT_SEM_DUE_SUBJECT_TEMPLATE, htmlTemplate: DEFAULT_SEM_DUE_HTML_TEMPLATE };
}

export function renderLeadEmailFromTemplates(
  _variant: LeadEmailVariant,
  subjectTpl: string,
  htmlTpl: string,
  payload: LeadEmailTemplatePayload,
): { subject: string; html: string } {
  const subjectVars = buildLeadEmailSubjectVars(payload);
  const htmlVars = buildLeadEmailHtmlVars(payload);
  return {
    subject: interpolateLeadEmailTemplate(subjectTpl, subjectVars),
    html: interpolateLeadEmailTemplate(htmlTpl, htmlVars),
  };
}
