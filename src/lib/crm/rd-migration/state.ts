import type { SupabaseClient } from "@supabase/supabase-js";

export type RdMigrationStatus = "pendente" | "convertida" | "concluida" | "fora";

export const RD_MIGRATION_STATUS_LABELS: Record<RdMigrationStatus, string> = {
  pendente: "A preencher",
  convertida: "No CRM, com pendências",
  concluida: "Migração concluída",
  fora: "Fora da migração",
};

/** Tabela/coluna da migration `20261019120000_rd_migracao` ainda não aplicada. */
export function isMissingRdMigrationSchema(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205";
}

/**
 * Lead do RD só leitura no CRM: tem snapshot do RD e ainda não foi convertido na virada.
 * Depois da conversão (`oportunidades.rd_migrado_em`) ele anda como qualquer lead do CRM.
 */
export function isRdReadOnlyLead(input: { hasRdSnapshot: boolean; rdMigradoEm: string | null | undefined }): boolean {
  return input.hasRdSnapshot && !input.rdMigradoEm;
}

export type RdMigrationLeadState = {
  migradoEm: string | null;
  status: RdMigrationStatus | null;
};

const EMPTY_STATE: RdMigrationLeadState = { migradoEm: null, status: null };

/** Estado da migração de um lead; sem a migration aplicada, devolve "não migrado". */
export async function loadRdMigrationLeadState(
  supabase: SupabaseClient,
  opportunityId: string,
): Promise<RdMigrationLeadState> {
  const [{ data: opp, error: oppError }, { data: row, error: rowError }] = await Promise.all([
    supabase.from("oportunidades").select("rd_migrado_em").eq("id", opportunityId).maybeSingle(),
    supabase.from("rd_migracoes").select("status").eq("oportunidade_id", opportunityId).maybeSingle(),
  ]);
  if (oppError && !isMissingRdMigrationSchema(oppError)) throw oppError;
  if (rowError && !isMissingRdMigrationSchema(rowError)) throw rowError;
  if (oppError) return EMPTY_STATE;
  return {
    migradoEm: ((opp as { rd_migrado_em?: string | null } | null)?.rd_migrado_em ?? null) || null,
    status: ((row as { status?: RdMigrationStatus } | null)?.status ?? null) || null,
  };
}

export function rdMigrationLeadHref(opportunityId: string): string {
  return `/crm/migracao-rd/${encodeURIComponent(opportunityId)}`;
}

export const RD_MIGRATION_PENDING_MESSAGE =
  "Este lead veio do RD e a migração ainda tem pendências. Complete a migração antes de avançar.";

/** Lead convertido com a migração incompleta não muda de etapa (decisão de 19/10/2026). */
export function rdMigrationBlocksAdvance(state: RdMigrationLeadState): boolean {
  return Boolean(state.migradoEm) && state.status === "convertida";
}

/** Sync do RD congelado na virada: webhook e cron não gravam mais nada. */
export async function isRdSyncFrozen(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from("rd_virada").select("congelado_em").eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingRdMigrationSchema(error)) return false;
    throw error;
  }
  return Boolean((data as { congelado_em?: string | null } | null)?.congelado_em);
}

/** IDs de oportunidades já convertidas (o sync do RD não pode mais alterá-las). */
export async function isOpportunityRdMigrated(supabase: SupabaseClient, opportunityId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("oportunidades")
    .select("rd_migrado_em")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) {
    if (isMissingRdMigrationSchema(error)) return false;
    throw error;
  }
  return Boolean((data as { rd_migrado_em?: string | null } | null)?.rd_migrado_em);
}
