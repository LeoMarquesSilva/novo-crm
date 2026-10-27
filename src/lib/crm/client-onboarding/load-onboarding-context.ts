import type { SupabaseClient } from "@supabase/supabase-js";

import { readStoredEngine } from "@/lib/crm/contract-engine/persist";
import { loadRdMigrationLeadState, rdMigrationBlocksAdvance } from "@/lib/crm/rd-migration/state";
import { parseAmount } from "@/lib/crm/contract-engine/money";
import { resolveContractingParties } from "@/lib/crm/contract-engine/proposal-snapshot";
import type { ContractingParty, ContractingPartyAddress } from "@/lib/crm/contract-engine/types";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import { loadDefaultContratoTemplate, loadPipelineFieldByCode } from "@/lib/crm/proposta-document-data";
import { parseEscopoJsonWithMeta } from "@/lib/crm/proposta-escopo-json";
import { getPrimarySumKeyForSubtipo } from "@/lib/crm/proposta-investimento-consolidado";
import {
  buildClientOnboardingPrefill,
  mergeOnboardingDraft,
} from "@/modules/crm/application/client-onboarding-prefill";
import {
  parseClientOnboardingPayload,
  parseOpsChecklist,
  type ClientOnboardingPayload,
  type ClientOnboardingStatus,
  type OpsChecklist,
} from "@/modules/crm/domain/client-onboarding";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type OnboardingRow = {
  id: string;
  status: ClientOnboardingStatus;
  payload: unknown;
  ops_checklist: unknown;
  grupo_nome: string | null;
  vios_referencia: string | null;
  submission_count: number;
  submitted_at: string | null;
  submitted_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
  return_comment: string | null;
  concluded_at: string | null;
  concluded_by: string | null;
  cliente_id: string | null;
  grupo_id: string | null;
  updated_at: string;
};

export type OnboardingContext = {
  opportunity: {
    id: string;
    etapa: OpportunityStage;
    solicitanteNome: string | null;
    solicitanteEmail: string | null;
    criadoPor: string | null;
    clienteId: string | null;
  };
  isRdLead: boolean;
  /** Lead do RD convertido na virada com a migração incompleta: não envia nem conclui o cadastro. */
  rdMigrationPending?: boolean;
  /** Tabela `lead_client_onboarding` ainda não existe no banco (migration pendente). */
  migrationPending: boolean;
  row: OnboardingRow | null;
  payload: ClientOnboardingPayload;
  checklist: OpsChecklist;
  /** Partes do contrato pelo cadastro do lead e a escolha da proposta (todas as contratantes). */
  contractParties?: ContractingParty[];
};

export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || error?.code === "42883";
}

const EMPTY_ADDRESS: ContractingPartyAddress = {
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
};

function addressFromFields(fieldByCode: Record<string, string>): ContractingPartyAddress {
  return {
    cep: fieldByCode.cp_cliente_cep ?? "",
    logradouro: fieldByCode.cp_cliente_logradouro ?? "",
    numero: fieldByCode.cp_cliente_numero ?? "",
    complemento: fieldByCode.cp_cliente_complemento ?? "",
    bairro: fieldByCode.cp_cliente_bairro ?? "",
    cidade: fieldByCode.cp_cliente_cidade ?? "",
    uf: fieldByCode.cp_cliente_uf ?? "",
  };
}

/** Valor de cada área da proposta (investimento por área), para sugerir o rateio. */
export function areaAmountsFromEscopo(escopoJson: string): { area: string; amount: number | null }[] {
  const { escopo } = parseEscopoJsonWithMeta(escopoJson ?? "");
  return Object.entries(escopo).map(([area, entries]) => {
    let total: number | null = null;
    for (const entry of entries) {
      const inv = entry.investimento;
      if (!inv?.subtipoId) continue;
      const sumKey = getPrimarySumKeyForSubtipo(inv.subtipoId);
      const value = parseAmount(sumKey ? inv.placeholders?.[sumKey] ?? "" : inv.placeholders?.VALORSPOT ?? "");
      if (value != null) total = (total ?? 0) + value;
    }
    return { area, amount: total };
  });
}

/** Lead, linha do cadastro e cadastro pré-preenchido (o rascunho salvo prevalece). */
export async function loadOnboardingContext(
  supabase: SupabaseClient,
  opportunityId: string,
): Promise<OnboardingContext | null> {
  const { data: opp, error: oppError } = await supabase
    .from("oportunidades")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();
  if (oppError) throw oppError;
  if (!opp) return null;
  const o = opp as Record<string, unknown>;

  const [{ data: rd }, onboardingResult, { data: intake }, fieldByCode, template, rdMigration] = await Promise.all([
    supabase.from("rd_deal_reconciliacao").select("detalhes").eq("oportunidade_id", opportunityId).limit(1).maybeSingle(),
    supabase.from("lead_client_onboarding").select("*").eq("oportunidade_id", opportunityId).maybeSingle(),
    supabase.from("lead_intakes").select("*").eq("oportunidade_id", opportunityId).maybeSingle(),
    loadPipelineFieldByCode(supabase as never, opportunityId),
    loadDefaultContratoTemplate(supabase as never),
    o.rd_migrado_em ? loadRdMigrationLeadState(supabase, opportunityId) : Promise.resolve(null),
  ]);

  const migrationPending = isMissingTableError(onboardingResult.error);
  if (onboardingResult.error && !migrationPending) throw onboardingResult.error;
  const row = (onboardingResult.data as OnboardingRow | null) ?? null;

  const { data: instance } = template
    ? await supabase
        .from("document_instances")
        .select("data_json")
        .eq("oportunidade_id", opportunityId)
        .eq("template_id", template.id)
        .maybeSingle()
    : { data: null };
  const dataJson = (instance as { data_json?: unknown } | null)?.data_json;
  const engine = readStoredEngine(
    dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as Record<string, unknown>) : {},
  ).build?.data;

  const clienteId = (o.cliente_id as string | null) ?? null;
  const [{ data: cliente }, { data: contatos }, { data: contract }] = await Promise.all([
    clienteId
      ? supabase
          .from("clientes")
          .select("razao_social, documento, logradouro, numero, complemento, bairro, cidade, uf, cep, email_principal, telefone_principal")
          .eq("id", clienteId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    clienteId
      ? supabase.from("contatos_cliente").select("nome, cargo, email, telefone, papel").eq("cliente_id", clienteId)
      : Promise.resolve({ data: [] }),
    supabase.from("contratos").select("data_assinatura").eq("oportunidade_id", opportunityId).maybeSingle(),
  ]);

  const proposalAddress = addressFromFields(fieldByCode);
  const intakeParties = resolveContractingParties({
    empresasIntake: parseEmpresasIntakeFromRecord((intake as Record<string, unknown> | null) ?? null),
    propostaEmpresasJson: fieldByCode.cp_proposta_empresas_json ?? "",
    address: proposalAddress,
  });
  const c = cliente as Record<string, string | null> | null;
  const financeContact = ((contatos ?? []) as { nome: string; cargo: string | null; email: string | null; telefone: string | null; papel?: string | null }[])
    .find((ct) => ct.papel === "financeiro");
  const signedRaw =
    (o.venda_fechada_em as string | null | undefined) ??
    ((contract as { data_assinatura?: string | null } | null)?.data_assinatura ?? null);

  const prefill = buildClientOnboardingPrefill({
    contractParties: engine?.contractingParties ?? null,
    intakeParties,
    proposalAddress,
    startRule: engine?.startRule ?? null,
    payment: engine?.payment ?? null,
    signedOn: signedRaw ? signedRaw.slice(0, 10) : null,
    areaAmounts: areaAmountsFromEscopo(fieldByCode.cp_escopo_detalhe_json ?? ""),
    focal: {
      name: fieldByCode.cp_nome_focal ?? null,
      email: fieldByCode.cp_email_focal ?? null,
      phone: fieldByCode.cp_tel_focal ?? null,
    },
    cliente: c
      ? {
          razaoSocial: c.razao_social,
          documento: c.documento,
          endereco: {
            ...EMPTY_ADDRESS,
            logradouro: c.logradouro ?? "",
            numero: c.numero ?? "",
            complemento: c.complemento ?? "",
            bairro: c.bairro ?? "",
            cidade: c.cidade ?? "",
            uf: c.uf ?? "",
            cep: c.cep ?? "",
          },
          email: c.email_principal,
          telefone: c.telefone_principal,
        }
      : null,
    contatoFinanceiro: financeContact
      ? { nome: financeContact.nome, cargo: financeContact.cargo, email: financeContact.email, telefone: financeContact.telefone }
      : null,
  });

  return {
    contractParties: intakeParties,
    opportunity: {
      id: String(o.id),
      etapa: o.etapa as OpportunityStage,
      solicitanteNome: (o.solicitante_nome as string | null) ?? null,
      solicitanteEmail: (o.solicitante_email as string | null) ?? null,
      criadoPor: (o.criado_por as string | null) ?? null,
      clienteId,
    },
    // Convertido na virada (`rd_migrado_em`): deixa de ser lead do RD só leitura.
    isRdLead: Boolean((rd as { detalhes?: unknown } | null)?.detalhes) && !o.rd_migrado_em,
    rdMigrationPending: rdMigration ? rdMigrationBlocksAdvance(rdMigration) : false,
    migrationPending,
    row,
    payload: mergeOnboardingDraft(row ? parseClientOnboardingPayload(row.payload) : null, prefill),
    checklist: parseOpsChecklist(row?.ops_checklist),
  };
}
