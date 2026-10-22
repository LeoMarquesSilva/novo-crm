import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Captador do grupo = solicitante interno do lead vinculado (sem coluna nova). */
export type GrupoCaptador = {
  oportunidadeId: string;
  nome: string | null;
  email: string | null;
};

type OppRow = {
  id: string;
  cliente_id: string | null;
  solicitante_email: string | null;
  updated_at: string;
};

/** O PostgREST devolve no máximo 1000 linhas por consulta; lê página a página até acabar. */
const PAGE_SIZE = 1000;

async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

/**
 * Um captador por grupo: o lead mais recente entre os clientes do grupo.
 * Reusa `lead_intakes.solicitante_nome` e `oportunidades.solicitante_email`.
 * As três leituras saem juntas (uma ida ao banco) em vez de buscar os leads por lotes de clientes.
 */
export async function loadCaptadoresByGrupo(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, GrupoCaptador>> {
  const byGrupo = new Map<string, GrupoCaptador>();
  const [clientes, intakes, opps] = await Promise.all([
    selectAllPages((from, to) =>
      supabase.from("clientes").select("id, grupo_id").not("grupo_id", "is", null).order("id").range(from, to),
    ),
    selectAllPages((from, to) =>
      supabase.from("lead_intakes").select("oportunidade_id, solicitante_nome").order("oportunidade_id").range(from, to),
    ),
    selectAllPages<OppRow>((from, to) =>
      supabase
        .from("oportunidades")
        .select("id, cliente_id, solicitante_email, updated_at")
        .not("cliente_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const grupoByCliente = new Map<string, string>();
  for (const cliente of clientes) {
    if (cliente.grupo_id) grupoByCliente.set(cliente.id, cliente.grupo_id);
  }
  if (grupoByCliente.size === 0) return byGrupo;

  const nomeByOpp = new Map<string, string | null>();
  for (const intake of intakes) {
    nomeByOpp.set(intake.oportunidade_id, intake.solicitante_nome);
  }

  const latest = new Map<string, { updatedAt: string; captador: GrupoCaptador }>();
  for (const opp of opps) {
    if (!opp.cliente_id) continue;
    const grupoId = grupoByCliente.get(opp.cliente_id);
    if (!grupoId) continue;
    const current = latest.get(grupoId);
    if (current && current.updatedAt >= opp.updated_at) continue;
    latest.set(grupoId, {
      updatedAt: opp.updated_at,
      captador: {
        oportunidadeId: opp.id,
        nome: nomeByOpp.get(opp.id)?.trim() || null,
        email: opp.solicitante_email?.trim() || null,
      },
    });
  }

  for (const [grupoId, row] of latest) byGrupo.set(grupoId, row.captador);
  return byGrupo;
}
