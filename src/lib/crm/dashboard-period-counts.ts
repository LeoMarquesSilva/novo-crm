import { periodDelta, type PeriodDelta, type PeriodWindow } from "@/lib/crm/dashboard-period";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CountedTable = "clientes" | "contratos";

async function countBetween(table: CountedTable, from: Date, to?: Date): Promise<number> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true }).gte("created_at", from.toISOString());
  if (to) query = query.lt("created_at", to.toISOString());
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Clientes e contratos cadastrados no período atual e no anterior (por `created_at`). */
export async function loadDashboardPeriodCounts(
  janela: PeriodWindow,
): Promise<{ clientes: PeriodDelta; contratos: PeriodDelta }> {
  const [clientesAtual, clientesAnterior, contratosAtual, contratosAnterior] = await Promise.all([
    countBetween("clientes", janela.inicio),
    countBetween("clientes", janela.inicioAnterior, janela.inicio),
    countBetween("contratos", janela.inicio),
    countBetween("contratos", janela.inicioAnterior, janela.inicio),
  ]);
  return {
    clientes: periodDelta(clientesAtual, clientesAnterior),
    contratos: periodDelta(contratosAtual, contratosAnterior),
  };
}
