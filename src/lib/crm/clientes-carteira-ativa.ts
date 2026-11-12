import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Cliente existente" no Novo lead (Cross Selling e a pergunta contrato novo ou aditivo) é só quem está na
 * carteira do escritório: linha de `clientes` ligada a um grupo econômico do OrquestrAI com status Cliente
 * ativo (`grupos_economicos.gestor_atividade = "ativo"`). Antes valia a tabela `clientes` inteira, com leads
 * que nunca viraram cliente e cadastros de teste (pedido de 12/11/2026).
 */
export function filtrarClientesDaCarteiraAtiva<T extends { grupo_id: string | null }>(
  clientes: T[],
  grupos: Array<{ id: string; gestor_atividade: string | null }>,
): T[] {
  const ativos = new Set(grupos.filter((g) => g.gestor_atividade === "ativo").map((g) => g.id));
  return clientes.filter((cliente) => cliente.grupo_id != null && ativos.has(cliente.grupo_id));
}

const PAGE = 1000;

/** Lê todas as linhas (o PostgREST devolve no máximo 1.000 por vez; a lista antiga parava nisso). */
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

/** Clientes da carteira ativa com as colunas pedidas (`grupo_id` entra sempre). */
export async function listarClientesDaCarteiraAtiva<T extends { grupo_id: string | null }>(
  supabase: SupabaseClient,
  colunas: string,
): Promise<T[]> {
  const grupos = await lerTudo<{ id: string; gestor_atividade: string | null }>((from, to) =>
    supabase.from("grupos_economicos").select("id, gestor_atividade").eq("gestor_atividade", "ativo").range(from, to),
  );
  if (grupos.length === 0) return [];
  const ids = grupos.map((g) => g.id);
  const clientes = await lerTudo<T>((from, to) =>
    supabase
      .from("clientes")
      .select(`${colunas}, grupo_id`)
      .in("grupo_id", ids)
      .order("razao_social", { ascending: true })
      .range(from, to),
  );
  return filtrarClientesDaCarteiraAtiva(clientes, grupos);
}
