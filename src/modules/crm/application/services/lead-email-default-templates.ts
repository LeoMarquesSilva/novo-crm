import { LEAD_EMAIL_COLORS } from "./lead-email-html-utils";
import { interpolateLeadEmailTemplate } from "./lead-email-interpolate";
import type { LeadEmailTemplatePayload } from "./lead-email-template-vars";
import { buildLeadEmailHtmlVars, buildLeadEmailSubjectVars } from "./lead-email-template-vars";

const C = LEAD_EMAIL_COLORS;

/** Assunto padrão — com due diligence */
export const DEFAULT_DUE_SUBJECT_TEMPLATE = "Novo pedido de due: {{razao_social_primeira}}";

/** HTML padrão — com due diligence (placeholders {{chave}}) */
export const DEFAULT_DUE_HTML_TEMPLATE = `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:0;background-color:${C.bg};border:1px solid ${C.gold};border-radius:8px;overflow:hidden;">
  <div style="background-color:${C.dark};color:${C.bg};padding:25px;text-align:center;">
    <h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:1px;">Novo Lead com Due Diligence</h1>
  </div>
  <div style="text-align:center;padding:10px 0;"><div style="display:inline-block;margin-top:10px;padding:5px 15px;background-color:${C.gold};color:${C.dark};border-radius:20px;font-weight:bold;letter-spacing:1px;">LEVANTAMENTO DOS DADOS</div></div>
  <div style="padding:25px;">
    <div style="margin-bottom:30px;">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:2px solid ${C.gold};">Informações do Solicitante</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Solicitante:</strong> {{solicitante}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Cadastrado por:</strong> {{cadastrado_por}}</p>
    </div>
    <div style="margin-bottom:30px;">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:2px solid ${C.gold};">Empresa/Pessoa</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Razão Social/Nome:</strong> {{razao_social}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">CNPJ/CPF:</strong> {{cnpj}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Tipo de Lead:</strong> {{tipo_de_lead}}</p>
      {{frag_nome_indicacao_due}}
      {{frag_tipo_indicacao_due}}
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.green};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Data e Horário do Cadastro</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Data e Hora do Cadastro:</strong> {{data_hora_cadastro}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.gold};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Detalhes da Due Diligence</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Prazo de Entrega:</strong> {{prazo_entrega_due}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Áreas de Análise:</strong> {{areas}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.gold};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Detalhes da Reunião</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Local:</strong> {{local_reuniao}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Data:</strong> {{data_reuniao}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Horário:</strong> {{horario_reuniao}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.red};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Ações Necessárias</h2>
      <ul style="margin:0;padding-left:20px;">
        <li style="margin-bottom:8px;"><strong style="color:${C.dark};">Abertura de pasta:</strong> <span style="color:${C.text};">Criar pasta de atendimento no sistema</span></li>
        <li style="margin-bottom:8px;"><strong style="color:${C.dark};">Agendamentos no VIOS:</strong> <span style="color:${C.text};">Registrar prazos e responsáveis</span></li>
        <li style="margin-bottom:8px;"><strong style="color:${C.dark};">Iniciar levantamento:</strong> <span style="color:${C.text};">Coletar documentos e informações necessárias</span></li>
      </ul>
    </div>
  </div>
  <div style="text-align:center;margin:30px 0 15px;">
    <p style="margin-bottom:15px;font-weight:bold;color:${C.dark};">Ações Rápidas</p>
    <a href="https://apps.powerapps.com/play/e/default-5411b7aa-53ee-4f05-bb25-dfca7a522fc2/a/eb58d0a1-df95-4e3d-887c-e35455aea134?tenantId=5411b7aa-53ee-4f05-bb25-dfca7a522fc2&amp;source=portal&amp;screenColor=rgba%2827%2c%2041%2c%2056%2c%201%29" target="_blank" style="display:inline-block;margin:5px;padding:10px 15px;background-color:${C.gold};color:${C.dark};text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">Solicitar Abertura de Pasta</a>
    <a href="https://crm.rdstation.com/app/deals/pipeline" target="_blank" style="display:inline-block;margin:5px;padding:10px 15px;background-color:${C.dark};color:${C.bg};text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">RD STATION CRM</a>
  </div>
  <div style="background-color:${C.dark};color:${C.bg};padding:15px;text-align:center;font-size:12px;">
    <p style="margin:0;">Este e-mail foi gerado automaticamente pelo sistema de Gestão de Leads do Bismarchi | Pires</p>
  </div>
</div>`;

/** Assunto padrão — sem due */
export const DEFAULT_SEM_DUE_SUBJECT_TEMPLATE = "Novo lead Cadastrado: {{razao_social_primeira}}";

export const DEFAULT_SEM_DUE_HTML_TEMPLATE = `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:0;background-color:${C.bg};border:1px solid ${C.gold};border-radius:8px;overflow:hidden;">
  <div style="background-color:${C.dark};color:${C.bg};padding:25px;text-align:center;">
    <h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:1px;">Novo Lead Cadastrado</h1>
    <p style="margin:10px 0 0;font-size:16px;">Processo Regular (Sem Due Diligence)</p>
  </div>
  <div style="padding:25px;">
    <div style="margin-bottom:30px;">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:2px solid ${C.gold};">Informações do Solicitante</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Solicitante:</strong> {{solicitante}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">E-mail:</strong> {{email}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Cadastrado por:</strong> {{cadastrado_por}}</p>
    </div>
    <div style="margin-bottom:30px;">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:2px solid ${C.gold};">Empresa/Pessoa</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Razão Social/Nome:</strong> {{razao_social}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">CNPJ/CPF:</strong> {{cnpj}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.green};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Informações de Captura</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Data e Hora do cadastro:</strong> {{data_hora_cadastro}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.gold};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Informações do Lead</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Tipo de Lead:</strong> {{tipo_de_lead}}</p>
      {{frag_nome_indicacao_sem}}
      {{frag_tipo_indicacao_sem}}
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.gold};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Detalhes da Reunião</h2>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Data e Horário:</strong> {{reuniao_data_horario_sem}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Local da Reunião:</strong> {{local_reuniao}}</p>
      <p style="margin:8px 0;color:${C.text};line-height:1.5;"><strong style="color:${C.dark};">Áreas Envolvidas:</strong> {{areas}}</p>
    </div>
    <div style="margin-bottom:30px;background-color:${C.white};padding:20px;border-radius:6px;border-left:5px solid ${C.red};box-shadow:0 2px 5px rgba(0,0,0,0.05);">
      <h2 style="color:${C.dark};font-size:18px;margin-top:0;margin-bottom:15px;padding-bottom:8px;border-bottom:1px solid #eee;">Ações Necessárias</h2>
      <ul style="margin:0;padding-left:20px;">
        <li style="margin-bottom:8px;"><strong style="color:${C.dark};">Preparação para reunião:</strong> <span style="color:${C.text};">Pesquisar informações preliminares sobre o cliente/empresa</span></li>
        <li style="margin-bottom:8px;"><strong style="color:${C.dark};">Material de apoio:</strong> <span style="color:${C.text};">Preparar apresentação institucional e cases relacionados à área</span></li>
      </ul>
    </div>
  </div>
  <div style="text-align:center;margin:30px 0 15px;">
    <a href="https://crm.rdstation.com/app/deals/pipeline" target="_blank" style="display:inline-block;margin:5px;padding:10px 15px;background-color:${C.gold};color:${C.dark};text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">Preencher Campos para Confecção de Proposta</a>
  </div>
  <div style="background-color:${C.dark};color:${C.bg};padding:15px;text-align:center;font-size:12px;">
    <p style="margin:0;">Este e-mail foi gerado automaticamente pelo sistema de Gestão de Leads do Bismarchi | Pires</p>
  </div>
</div>`;

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
