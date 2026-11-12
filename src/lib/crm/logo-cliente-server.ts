import type { SupabaseClient } from "@supabase/supabase-js";
import { indexarLogosPorGrupo, logoDoGrupo, type PerfilLogoIcp } from "@/lib/crm/logo-cliente";

/**
 * Carga das logos dos grupos para as telas do CRM (só no servidor: `icp_group_profiles` é lida com
 * service role). São duas tabelas pequenas (~150 perfis, ~300 grupos), lidas inteiras a cada pedido.
 */

const PAGE = 1000;

async function lerTudo<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Logo por nome do grupo (`grupos_economicos.nome`). Falha na leitura vira "sem logo", nunca erro da tela. */
export async function carregarLogosPorNomeDeGrupo(
  supabase: SupabaseClient,
): Promise<(nomeDoGrupo: string | null | undefined) => string | null> {
  try {
    const perfis = await lerTudo<PerfilLogoIcp>((from, to) =>
      supabase
        .from("icp_group_profiles")
        .select("grupo, logo_path, updated_at")
        .not("logo_path", "is", null)
        .order("grupo")
        .range(from, to),
    );
    const logos = indexarLogosPorGrupo(process.env.NEXT_PUBLIC_SUPABASE_URL, perfis);
    return (nome) => logoDoGrupo(logos, nome);
  } catch (error) {
    console.error("Falha ao carregar as logos dos grupos (icp_group_profiles)", error);
    return () => null;
  }
}

/** Logo por `grupos_economicos.id` (só os grupos que têm logo). */
export async function carregarLogosPorGrupoId(supabase: SupabaseClient): Promise<Map<string, string>> {
  const [logoPorNome, grupos] = await Promise.all([
    carregarLogosPorNomeDeGrupo(supabase),
    lerTudo<{ id: string; nome: string }>((from, to) =>
      supabase.from("grupos_economicos").select("id, nome").order("id").range(from, to),
    ).catch((error: unknown) => {
      console.error("Falha ao carregar os grupos para as logos", error);
      return [] as Array<{ id: string; nome: string }>;
    }),
  ]);
  const out = new Map<string, string>();
  for (const grupo of grupos) {
    const url = logoPorNome(grupo.nome);
    if (url) out.set(grupo.id, url);
  }
  return out;
}

/** Logo de um cliente (`clientes.id`) pela logo do grupo dele; `null` sem grupo ou sem logo. */
export async function carregarLogoDoCliente(
  supabase: SupabaseClient,
  clienteId: string | null | undefined,
): Promise<string | null> {
  if (!clienteId) return null;
  try {
    const { data: cliente } = await supabase.from("clientes").select("grupo_id").eq("id", clienteId).maybeSingle();
    const grupoId = (cliente as { grupo_id: string | null } | null)?.grupo_id;
    if (!grupoId) return null;
    const [{ data: grupo }, logoPorNome] = await Promise.all([
      supabase.from("grupos_economicos").select("nome").eq("id", grupoId).maybeSingle(),
      carregarLogosPorNomeDeGrupo(supabase),
    ]);
    return logoPorNome((grupo as { nome: string } | null)?.nome);
  } catch (error) {
    console.error("Falha ao carregar a logo do cliente", clienteId, error);
    return null;
  }
}
