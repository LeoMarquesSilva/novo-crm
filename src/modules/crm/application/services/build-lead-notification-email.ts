import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewLeadPayload } from "./new-lead-payload";
import {
  DEFAULT_DUE_HTML_TEMPLATE,
  DEFAULT_DUE_SUBJECT_TEMPLATE,
  DEFAULT_SEM_DUE_HTML_TEMPLATE,
  DEFAULT_SEM_DUE_SUBJECT_TEMPLATE,
  getDefaultTemplatesForVariant,
  renderLeadEmailFromTemplates,
  type LeadEmailVariant,
} from "./lead-email-default-templates";
import type { LeadEmailTemplatePayload } from "./lead-email-template-vars";

export type { LeadEmailVariant };

type EmailTemplateInput = Pick<
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

function asTemplatePayload(p: EmailTemplateInput): LeadEmailTemplatePayload {
  return p as LeadEmailTemplatePayload;
}

/** Modelo embutido (ignora personalização na BD). */
export function buildDueEmail(payload: EmailTemplateInput): { subject: string; html: string } {
  return renderLeadEmailFromTemplates(
    "due",
    DEFAULT_DUE_SUBJECT_TEMPLATE,
    DEFAULT_DUE_HTML_TEMPLATE,
    asTemplatePayload(payload),
  );
}

export function buildSemDueEmail(payload: EmailTemplateInput): { subject: string; html: string } {
  return renderLeadEmailFromTemplates(
    "sem_due",
    DEFAULT_SEM_DUE_SUBJECT_TEMPLATE,
    DEFAULT_SEM_DUE_HTML_TEMPLATE,
    asTemplatePayload(payload),
  );
}

export function getDefaultLeadEmailTemplates(): {
  due: { subjectTemplate: string; htmlTemplate: string };
  sem_due: { subjectTemplate: string; htmlTemplate: string };
} {
  const due = getDefaultTemplatesForVariant("due");
  const sem = getDefaultTemplatesForVariant("sem_due");
  return {
    due: { subjectTemplate: due.subjectTemplate, htmlTemplate: due.htmlTemplate },
    sem_due: { subjectTemplate: sem.subjectTemplate, htmlTemplate: sem.htmlTemplate },
  };
}

/**
 * Monta assunto + HTML usando template da BD quando existir; caso contrário, os padrões do código.
 */
export async function buildLeadNotificationEmailMessage(
  supabase: SupabaseClient,
  variant: LeadEmailVariant,
  payload: NewLeadPayload,
): Promise<{ subject: string; html: string }> {
  const defaults = getDefaultTemplatesForVariant(variant);
  const { data } = await supabase
    .from("lead_email_notification_template")
    .select("subject_template, html_template")
    .eq("variant", variant)
    .maybeSingle();

  const subjectTpl =
    data?.subject_template?.trim() ? data.subject_template.trim() : defaults.subjectTemplate;
  const htmlTpl = data?.html_template?.trim() ? data.html_template.trim() : defaults.htmlTemplate;

  return renderLeadEmailFromTemplates(variant, subjectTpl, htmlTpl, asTemplatePayload(payload));
}
