import {
  prepareConfeccaoFieldValues,
  withConfeccaoQualificacao,
} from "@/components/crm/confeccao-proposta-transition";
import { listMissingOnboardingFields, type ClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

import { RD_LABELS } from "./prefill";
import { rdText, type RdDealSnapshot } from "./rd-deal";
import { empresasIntakeFromCadastro, type RdMigrationRequirements } from "./requirements";
import { rdMigrationTargetStage, stageBetween } from "./scope";
import type { RdMigrationValues } from "./values";

export type RdMigrationResponsible = {
  appUserId: string;
  email: string | null;
  fullName: string;
  origem: "admin" | "solicitante" | "dono_rd";
};

export type AppUserDirectoryEntry = { id: string; fullName: string; email: string | null };

/**
 * Responsável que preenche a migração (decisão de 19/10/2026): o admin, se atribuiu; senão o
 * Solicitante do RD ("Email Solicitante") casado pelo e-mail com um usuário do CRM; senão o dono
 * do negócio no RD. Sem nenhum, o negócio fica "sem responsável" até o admin escolher.
 */
export function resolveRdMigrationResponsible(input: {
  deal: RdDealSnapshot | null;
  assignedAppUserId: string | null;
  users: AppUserDirectoryEntry[];
}): RdMigrationResponsible | null {
  const byId = new Map(input.users.map((u) => [u.id, u]));
  const byEmail = new Map(
    input.users.filter((u) => u.email).map((u) => [String(u.email).trim().toLowerCase(), u]),
  );
  const toResponsible = (u: AppUserDirectoryEntry, origem: RdMigrationResponsible["origem"]) => ({
    appUserId: u.id,
    email: u.email ? u.email.trim().toLowerCase() : null,
    fullName: u.fullName,
    origem,
  });

  if (input.assignedAppUserId) {
    const assigned = byId.get(input.assignedAppUserId);
    if (assigned) return toResponsible(assigned, "admin");
  }
  if (input.deal) {
    const solicitanteEmail = rdText(input.deal, RD_LABELS.solicitanteEmail).trim().toLowerCase();
    const solicitante = solicitanteEmail ? byEmail.get(solicitanteEmail) : undefined;
    if (solicitante) return toResponsible(solicitante, "solicitante");
    const owner = input.deal.ownerEmail ? byEmail.get(input.deal.ownerEmail) : undefined;
    if (owner) return toResponsible(owner, "dono_rd");
  }
  return null;
}

export type RdMigrationLeadIntakeRow = {
  oportunidade_id: string;
  solicitante_nome: string | null;
  cadastrado_por_email: string;
  contexto_comercial: string;
  due_diligence: boolean;
  data_entrega_due: string | null;
  horario_entrega_due: string | null;
  empresas_json: Array<{ tipo_documento: "CPF" | "CNPJ"; razao_social: string; documento: string }>;
  areas_analise: string[];
  local_reuniao: string;
  data_reuniao: string | null;
  horario_reuniao: string | null;
  tipo_lead: string;
  tipo_indicacao: string | null;
  nome_indicacao: string | null;
  /** Colunas da migration 20261008183000; o executor tenta sem elas se não existirem. */
  plataforma: string | null;
  area_cross_selling: string | null;
  decisor: string | null;
};

export type RdMigrationOnboardingStatus = "rascunho" | "enviado" | "concluido";

export type RdMigrationPlan = {
  mode: "convert" | "update";
  fromStage: OpportunityStage;
  targetStage: OpportunityStage;
  opportunityUpdate: {
    etapa?: OpportunityStage;
    rd_migrado_em?: string;
    havera_due_diligence: boolean;
    link_proposta?: string;
    link_contrato?: string;
    solicitante_email?: string;
    d4sign_document_uuid?: string;
    encerramento?: "ganho";
    venda_fechada_em?: string;
    updated_at: string;
  };
  intake: RdMigrationLeadIntakeRow;
  fieldValues: Array<{ code: string; value: string | string[] }>;
  onboarding: { status: RdMigrationOnboardingStatus; payload: ClientOnboardingPayload } | null;
  contract: { ensureDraft: boolean; dataAssinatura: string | null };
  d4signDocumentUuid: string | null;
  migrationStatus: "convertida" | "concluida";
  syncDueTasks: boolean;
  enteredInclusaoFaturamento: boolean;
};

function nullIfEmpty(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

/** Campos `cp_*` a gravar: os preenchidos, mais empresas da proposta e a qualificação montada. */
export function rdMigrationFieldValues(values: RdMigrationValues): Array<{ code: string; value: string | string[] }> {
  const empresasIntake = empresasIntakeFromCadastro(values);
  let campos = prepareConfeccaoFieldValues({ fieldValues: values.campos, empresasIntake });
  const hasAddress = Boolean(String(campos.cp_cliente_cep ?? "").trim() || String(campos.cp_cliente_logradouro ?? "").trim());
  if (hasAddress) campos = withConfeccaoQualificacao({ customValues: campos, empresasIntake });
  const out: Array<{ code: string; value: string | string[] }> = [];
  for (const [code, value] of Object.entries(campos)) {
    if (value === undefined) continue;
    if (Array.isArray(value) ? value.length === 0 : !String(value).trim()) continue;
    out.push({ code, value });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function onboardingStatusFor(stage: OpportunityStage, payload: ClientOnboardingPayload): RdMigrationOnboardingStatus | null {
  if (!stageBetween(stage, "aguardando_cadastro", "inclusao_faturamento")) return null;
  const complete = listMissingOnboardingFields(payload).length === 0;
  if (stage === "cadastro_novo_cliente") return complete ? "enviado" : "rascunho";
  if (stage === "inclusao_faturamento") return complete ? "concluido" : "rascunho";
  return "rascunho";
}

/**
 * O que gravar para o negócio virar lead do CRM (`convert`) ou para aplicar o formulário de um
 * lead já convertido (`update`, sem mudar etapa). Puro: o executor (`service.ts`) só aplica.
 */
export function planRdMigration(input: {
  mode: "convert" | "update";
  opportunity: {
    id: string;
    etapa: OpportunityStage;
    vendaFechadaEm: string | null;
    solicitanteEmail: string | null;
  };
  /** Etapa do RD (`resolveRdMigrationScope`). No `update`, a etapa atual do lead. */
  rdStage: OpportunityStage;
  values: RdMigrationValues;
  requirements: RdMigrationRequirements;
  responsible: RdMigrationResponsible | null;
  deal: RdDealSnapshot | null;
  /** E-mail de quem converteu, se o RD não diz quem cadastrou. */
  actorEmail: string | null;
  now: string;
}): RdMigrationPlan {
  const { values, responsible, deal, now } = input;
  const due = values.cadastro.dueDiligence === "Sim";
  const targetStage =
    input.mode === "convert" ? rdMigrationTargetStage(input.rdStage, due) : input.opportunity.etapa;
  const postSale = stageBetween(targetStage, "aguardando_cadastro", "inclusao_faturamento");
  const ev = values.evidencias;

  const opportunityUpdate: RdMigrationPlan["opportunityUpdate"] = {
    havera_due_diligence: due,
    updated_at: now,
  };
  if (input.mode === "convert") {
    opportunityUpdate.etapa = targetStage;
    opportunityUpdate.rd_migrado_em = now;
    if (postSale) {
      opportunityUpdate.encerramento = "ganho";
      opportunityUpdate.venda_fechada_em =
        input.opportunity.vendaFechadaEm ??
        (deal?.closedAt && !Number.isNaN(Date.parse(deal.closedAt)) ? new Date(deal.closedAt).toISOString() : null) ??
        (ev.dataAssinatura ? `${ev.dataAssinatura}T15:00:00.000Z` : now);
    }
  }
  if (ev.linkProposta.trim()) opportunityUpdate.link_proposta = ev.linkProposta.trim();
  if (ev.linkContrato.trim()) opportunityUpdate.link_contrato = ev.linkContrato.trim();
  if (ev.d4signDocumentUuid.trim()) opportunityUpdate.d4sign_document_uuid = ev.d4signDocumentUuid.trim();
  if (responsible?.email) opportunityUpdate.solicitante_email = responsible.email;

  const c = values.cadastro;
  const rdCadastroPor = deal ? rdText(deal, RD_LABELS.cadastroPor).trim().toLowerCase() : "";
  const intake: RdMigrationLeadIntakeRow = {
    oportunidade_id: input.opportunity.id,
    solicitante_nome: responsible?.fullName ?? (deal ? nullIfEmpty(rdText(deal, RD_LABELS.solicitante)) : null),
    cadastrado_por_email:
      (rdCadastroPor.includes("@") ? rdCadastroPor : "") ||
      responsible?.email ||
      input.opportunity.solicitanteEmail ||
      input.actorEmail ||
      "migracao-rd@crm.local",
    contexto_comercial: `Migrado do RD Station${deal?.id ? ` (negócio ${deal.id})` : ""}.`,
    due_diligence: due,
    data_entrega_due: nullIfEmpty(c.dataEntregaDue),
    horario_entrega_due: nullIfEmpty(c.horarioEntregaDue),
    empresas_json: c.empresas
      .filter((e) => e.razao_social.trim() || e.documento.trim())
      .map((e) => ({ tipo_documento: e.tipo_documento, razao_social: e.razao_social.trim(), documento: e.documento.trim() })),
    areas_analise: c.areasAnalise,
    local_reuniao: c.localReuniao.trim(),
    data_reuniao: nullIfEmpty(c.dataReuniao),
    horario_reuniao: nullIfEmpty(c.horarioReuniao),
    tipo_lead: c.tipoLead.trim(),
    tipo_indicacao: c.tipoLead === "Indicacao" ? nullIfEmpty(c.tipoIndicacao) : null,
    nome_indicacao: c.tipoLead === "Indicacao" ? nullIfEmpty(c.nomeIndicacao) : null,
    plataforma: c.tipoLead === "Lead Digital" ? nullIfEmpty(c.plataforma) : null,
    area_cross_selling: c.tipoLead === "Cross Selling" ? nullIfEmpty(c.areaCrossSelling) : null,
    decisor: nullIfEmpty(c.decisor),
  };

  const onboardingStatus = onboardingStatusFor(targetStage, values.onboarding);

  return {
    mode: input.mode,
    fromStage: input.opportunity.etapa,
    targetStage,
    opportunityUpdate,
    intake,
    fieldValues: rdMigrationFieldValues(values),
    onboarding: onboardingStatus ? { status: onboardingStatus, payload: values.onboarding } : null,
    contract: { ensureDraft: postSale, dataAssinatura: nullIfEmpty(ev.dataAssinatura) },
    d4signDocumentUuid: nullIfEmpty(ev.d4signDocumentUuid),
    migrationStatus: input.requirements.complete ? "concluida" : "convertida",
    syncDueTasks:
      input.mode === "convert" && due && stageBetween(targetStage, "levantamento_dados", "due_diligence_finalizada"),
    enteredInclusaoFaturamento: input.mode === "convert" && targetStage === "inclusao_faturamento",
  };
}
