import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchOrqestraiClientGroups } from "@/lib/orqestrai/client-groups";
import {
  collectContractGroupIds,
  computeActiveGroupCoverage,
  type ActiveGroupCoverage,
} from "./contract-hub-summary";

export type ActiveGroupCoverageResult = ActiveGroupCoverage & {
  error: string | null;
};

const emptyCoverage = (): ActiveGroupCoverage => ({
  activeCount: 0,
  inactiveCount: 0,
  coveredCount: 0,
  orphans: [],
});

export async function loadActiveGroupCoverage(): Promise<ActiveGroupCoverageResult> {
  try {
    const supabase = createSupabaseAdminClient();
    const [orqestraiGroups, localResult, contractsResult, clientsResult] = await Promise.all([
      fetchOrqestraiClientGroups(),
      supabase.from("grupos_economicos").select("id, nome, chave_estavel, orqestrai_id"),
      supabase.from("contratos").select("grupo_id, cliente_id"),
      supabase.from("clientes").select("id, grupo_id"),
    ]);

    if (!orqestraiGroups) {
      return {
        ...emptyCoverage(),
        error: "OrquestrAI não configurado para medir grupos ativos.",
      };
    }

    const queryError =
      localResult.error?.message ?? contractsResult.error?.message ?? clientsResult.error?.message ?? null;

    const coverage = computeActiveGroupCoverage({
      orqestraiGroups,
      localGroups: (localResult.data ?? []).map((group) => ({
        id: group.id,
        nome: group.nome,
        chaveEstavel: group.chave_estavel,
        orqestraiId: group.orqestrai_id,
      })),
      contractGroupIds: collectContractGroupIds({
        contracts: (contractsResult.data ?? []).map((row) => ({
          grupoId: row.grupo_id,
          clienteId: row.cliente_id,
        })),
        clients: (clientsResult.data ?? []).map((row) => ({
          id: row.id,
          grupoId: row.grupo_id,
        })),
      }),
    });

    return { ...coverage, error: queryError };
  } catch (error) {
    return {
      ...emptyCoverage(),
      error: error instanceof Error ? error.message : "Falha ao medir grupos ativos sem contrato.",
    };
  }
}
