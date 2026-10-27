import type { PostgrestError } from "@supabase/supabase-js";

import { timestampsMatch } from "@/lib/crm/timestamps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  ContractConfigurationError,
  CONTRACT_ERROR_MESSAGES,
  type ContractConfigurationRepository,
  type ContractConfigurationWrite,
  type ContractVersionConfigurationContext,
} from "../application/services/save-contract-configuration";
import { isMonthlyFeeStartingMidMonth } from "../domain/competency";
import type { ContractValidationIssue } from "../domain/contract-validation";
import { loadStartMonthBilling } from "./start-month-billing";

const knownCodes = [
  "CONTRACT_NOT_FOUND",
  "CONTRACT_CONFIGURATION_INVALID",
  "CONTRACT_VERSION_CONFLICT",
  "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE",
  "OPPORTUNITY_STAGE_CONFLICT",
] as const;

function rpcError(error: PostgrestError): never {
  const code = knownCodes.find((candidate) => error.message.includes(candidate));
  if (code) throw new ContractConfigurationError(code, CONTRACT_ERROR_MESSAGES[code]);
  throw new Error(error.message);
}

function jsonSafe(value: unknown): Json {
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]),
    );
  }
  throw new TypeError("Valor não serializável no envelope do contrato.");
}

export type ActivateContractVersionInput = {
  contractId: string;
  versionId: string;
  actorId: string;
  expectedVersionUpdatedAt: string;
  advanceOpportunity: boolean;
};

export type ActivateContractVersionResult = {
  contractId: string;
  versionId: string;
  opportunityId: string | null;
  opportunityTransitionId: string | null;
};

export class SupabaseContractRepository implements ContractConfigurationRepository {
  async findVersionContext(
    contractId: string,
    versionId: string,
  ): Promise<ContractVersionConfigurationContext | null> {
    const supabase = createSupabaseAdminClient();
    const { data: version, error: versionError } = await supabase
      .from("contrato_versoes")
      .select("status, numero, updated_at")
      .eq("id", versionId)
      .eq("contrato_id", contractId)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    if (!version) return null;

    const { data: contract, error: contractError } = await supabase
      .from("contratos")
      .select("oportunidade_id")
      .eq("id", contractId)
      .maybeSingle();
    if (contractError) throw new Error(contractError.message);
    if (!contract) return null;

    let opportunityStage: ContractVersionConfigurationContext["opportunityStage"] = null;
    if (contract.oportunidade_id) {
      const { data: opportunity, error: opportunityError } = await supabase
        .from("oportunidades")
        .select("etapa")
        .eq("id", contract.oportunidade_id)
        .maybeSingle();
      if (opportunityError) throw new Error(opportunityError.message);
      opportunityStage = opportunity?.etapa ?? null;
    }

    return {
      status: version.status,
      number: version.numero,
      updatedAt: version.updated_at,
      opportunityId: contract.oportunidade_id,
      opportunityStage,
    };
  }

  async saveConfigurationAtomic(input: ContractConfigurationWrite): Promise<{ updatedAt: string }> {
    const { configuration } = input;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("save_contract_configuration_atomic", {
      p_actor_id: input.actorId,
      p_configuration: jsonSafe({
        responsibles: configuration.responsibles,
        areas: configuration.areas,
        version: configuration.version,
        substitutionEvidence: configuration.substitutionEvidence,
      }),
      p_contract: jsonSafe({
        clientId: configuration.clientId,
        startsAt: configuration.startsAt,
        indefinite: configuration.indefinite,
        dueDay: configuration.dueDay,
        renewalDate: configuration.renewalDate,
        renewalAlertDate: configuration.renewalAlertDate,
        adjustmentIndex: configuration.adjustmentIndex,
        firstInvoiceAt: configuration.firstInvoiceAt,
        firstInvoiceConditioned: configuration.firstInvoiceConditioned,
      }),
      p_contract_id: input.contractId,
      p_expected_version_updated_at: input.expectedVersionUpdatedAt,
      p_now: new Date().toISOString(),
      p_version_id: input.versionId,
    });
    if (error) rpcError(error);
    // O RPC devolve `p_now`, mas o trigger `set_contract_updated_at` grava o now() do banco:
    // devolver o carimbo gravado, senão o próximo salvar/ativar na mesma tela dá conflito de versão.
    const { data: saved } = await supabase
      .from("contrato_versoes")
      .select("updated_at")
      .eq("id", input.versionId)
      .maybeSingle();
    return { updatedAt: (saved?.updated_at as string | undefined) ?? data };
  }

  async activateVersionAtomic(input: ActivateContractVersionInput): Promise<ActivateContractVersionResult> {
    const supabase = createSupabaseAdminClient();
    const [{ data: contract }, { data: version }, { count: responsibleCount }, { data: componentRows }, startMonthBilling] = await Promise.all([
      supabase
        .from("contratos")
        .select("cliente_id, vigente_de, primeiro_vencimento, primeiro_faturamento_condicionado")
        .eq("id", input.contractId)
        .maybeSingle(),
      supabase
        .from("contrato_versoes")
        .select("vigente_de, updated_at, status")
        .eq("id", input.versionId)
        .eq("contrato_id", input.contractId)
        .maybeSingle(),
      supabase
        .from("contrato_responsaveis")
        .select("id", { count: "exact", head: true })
        .eq("contrato_id", input.contractId),
      supabase
        .from("contrato_componentes_cobranca")
        .select("tipo, periodo_inicio")
        .eq("versao_id", input.versionId),
      loadStartMonthBilling(supabase, input.versionId),
    ]);
    const componentCount = componentRows?.length ?? 0;
    const issues: ContractValidationIssue[] = [];
    if (!contract?.cliente_id) {
      issues.push({ code: "client_required", path: "clientId", severity: "error", message: "Informe o cliente do contrato." });
    }
    if (!contract?.vigente_de) {
      issues.push({ code: "start_date_required", path: "startsAt", severity: "error", message: "Informe o início da vigência." });
    }
    if (!contract?.primeiro_vencimento && !contract?.primeiro_faturamento_condicionado) {
      issues.push({
        code: "first_invoice_required",
        path: "firstInvoiceAt",
        severity: "error",
        message: "Informe o primeiro faturamento ou marque-o como condicionado.",
      });
    }
    if (!version?.vigente_de) {
      issues.push({
        code: "start_date_required",
        path: "version.effectiveFrom",
        severity: "error",
        message: "Informe o início da vigência da versão.",
      });
    }
    if (!responsibleCount) {
      issues.push({
        code: "responsible_required",
        path: "responsibles",
        severity: "error",
        message: "Informe ao menos um responsável.",
      });
    }
    if (!componentCount) {
      issues.push({
        code: "billing_component_required",
        path: "version.components",
        severity: "error",
        message: "Informe ao menos um componente de cobrança.",
      });
    }
    // Sem a coluna (migration pendente) a escolha não é gravada; não dá para exigir.
    if (
      startMonthBilling.stored &&
      !startMonthBilling.value &&
      (componentRows ?? []).some((row) =>
        isMonthlyFeeStartingMidMonth({ kind: row.tipo, effectiveFrom: row.periodo_inicio ?? version?.vigente_de ?? null }))
    ) {
      issues.push({
        code: "start_month_billing_required",
        path: "version.startMonthBilling",
        severity: "error",
        message: "Escolha como cobrar a mensalidade que começa no meio do mês (etapa Identificação e vigência).",
      });
    }
    if (issues.length) {
      throw new ContractConfigurationError(
        "CONTRACT_CONFIGURATION_INVALID",
        CONTRACT_ERROR_MESSAGES.CONTRACT_CONFIGURATION_INVALID,
        issues,
      );
    }
    if (!version) {
      throw new ContractConfigurationError("CONTRACT_NOT_FOUND", CONTRACT_ERROR_MESSAGES.CONTRACT_NOT_FOUND);
    }
    if (version.status !== "rascunho") {
      throw new ContractConfigurationError(
        "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE",
        CONTRACT_ERROR_MESSAGES.ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE,
      );
    }
    if (!timestampsMatch(version.updated_at, input.expectedVersionUpdatedAt)) {
      throw new ContractConfigurationError(
        "CONTRACT_VERSION_CONFLICT",
        CONTRACT_ERROR_MESSAGES.CONTRACT_VERSION_CONFLICT,
      );
    }

    const { data, error } = await supabase.rpc("activate_contract_version_atomic", {
      p_actor_id: input.actorId,
      p_advance_opportunity: input.advanceOpportunity,
      p_contract_id: input.contractId,
      p_expected_version_updated_at: version.updated_at,
      p_now: new Date().toISOString(),
      p_version_id: input.versionId,
    });
    if (error) rpcError(error);
    const row = data[0];
    if (!row) throw new Error("A ativação não retornou o contrato atualizado.");
    return {
      contractId: row.contract_id,
      versionId: row.version_id,
      opportunityId: row.opportunity_id,
      opportunityTransitionId: row.opportunity_transition_id,
    };
  }
}
