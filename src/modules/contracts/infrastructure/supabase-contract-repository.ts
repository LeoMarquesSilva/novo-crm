import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  ContractConfigurationError,
  type ContractConfigurationRepository,
  type ContractConfigurationWrite,
  type ContractVersionConfigurationContext,
} from "../application/services/save-contract-configuration";

const knownCodes = [
  "CONTRACT_NOT_FOUND",
  "CONTRACT_CONFIGURATION_INVALID",
  "CONTRACT_VERSION_CONFLICT",
  "ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE",
  "OPPORTUNITY_STAGE_CONFLICT",
] as const;

function rpcError(error: PostgrestError): never {
  const code = knownCodes.find((candidate) => error.message.includes(candidate));
  if (code) throw new ContractConfigurationError(code, error.message);
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
      }),
      p_contract: jsonSafe({
        clientId: configuration.clientId,
        startsAt: configuration.startsAt,
        firstInvoiceAt: configuration.firstInvoiceAt,
        firstInvoiceConditioned: configuration.firstInvoiceConditioned,
      }),
      p_contract_id: input.contractId,
      p_expected_version_updated_at: input.expectedVersionUpdatedAt,
      p_now: new Date().toISOString(),
      p_version_id: input.versionId,
    });
    if (error) rpcError(error);
    return { updatedAt: data };
  }

  async activateVersionAtomic(input: ActivateContractVersionInput): Promise<ActivateContractVersionResult> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("activate_contract_version_atomic", {
      p_actor_id: input.actorId,
      p_advance_opportunity: input.advanceOpportunity,
      p_contract_id: input.contractId,
      p_expected_version_updated_at: input.expectedVersionUpdatedAt,
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
