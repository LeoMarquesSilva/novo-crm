import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { parseStartMonthBilling, type StartMonthBilling } from "../domain/competency";

/**
 * Escolha do Financeiro para a mensalidade que começa no meio do mês, gravada na versão
 * (`contrato_versoes.cobranca_mes_inicio`). `stored` é falso enquanto a migration
 * `20261018130000_contract_closing_start_month.sql` não estiver aplicada (coluna ausente).
 */
export async function loadStartMonthBilling(
  supabase: SupabaseClient<Database>,
  versionId: string,
): Promise<{ value: StartMonthBilling | null; stored: boolean }> {
  const { data, error } = await supabase
    .from("contrato_versoes")
    .select("cobranca_mes_inicio")
    .eq("id", versionId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { value: null, stored: false };
    throw new Error(error.message);
  }
  return { value: parseStartMonthBilling(data?.cobranca_mes_inicio), stored: true };
}

/** A escolha gravada; `null` sem resposta ou sem a coluna. */
export async function readStartMonthBilling(
  supabase: SupabaseClient<Database>,
  versionId: string,
): Promise<StartMonthBilling | null> {
  return (await loadStartMonthBilling(supabase, versionId)).value;
}
