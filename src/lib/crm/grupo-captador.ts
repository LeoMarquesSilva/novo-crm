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

/**
 * Um captador por grupo: o lead mais recente entre os clientes do grupo.
 * Reusa `lead_intakes.solicitante_nome` e `oportunidades.solicitante_email`.
 */
export async function loadCaptadoresByGrupo(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, GrupoCaptador>> {
  const byGrupo = new Map<string, GrupoCaptador>();
  const [{ data: clientes, error: clientesError }, { data: intakes, error: intakesError }] =
    await Promise.all([
      supabase.from("clientes").select("id, grupo_id").not("grupo_id", "is", null),
      supabase.from("lead_intakes").select("oportunidade_id, solicitante_nome"),
    ]);
  if (clientesError) throw clientesError;
  if (intakesError) throw intakesError;

  const grupoByCliente = new Map<string, string>();
  for (const cliente of clientes ?? []) {
    if (cliente.grupo_id) grupoByCliente.set(cliente.id, cliente.grupo_id);
  }
  if (grupoByCliente.size === 0) return byGrupo;

  const nomeByOpp = new Map<string, string | null>();
  for (const intake of intakes ?? []) {
    nomeByOpp.set(intake.oportunidade_id, intake.solicitante_nome);
  }

  const clienteIds = [...grupoByCliente.keys()];
  const opps: OppRow[] = [];
  const chunk = 200;
  for (let index = 0; index < clienteIds.length; index += chunk) {
    const slice = clienteIds.slice(index, index + chunk);
    const { data, error } = await supabase
      .from("oportunidades")
      .select("id, cliente_id, solicitante_email, updated_at")
      .in("cliente_id", slice);
    if (error) throw error;
    opps.push(...((data ?? []) as OppRow[]));
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
