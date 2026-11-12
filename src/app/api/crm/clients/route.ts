import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { dedupeClientesByDocument } from "@/lib/crm/dedupe-clientes";
import { listarClientesDaCarteiraAtiva } from "@/lib/crm/clientes-carteira-ativa";
import { carregarLogosPorGrupoId } from "@/lib/crm/logo-cliente-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    // Só a carteira ativa do escritório (OrquestrAI), não a tabela `clientes` inteira (12/11/2026).
    let data: Array<{ id: string; razao_social: string; documento: string; grupo_id: string | null }>;
    // Logo do grupo do cliente, a mesma do ICP (12/11/2026); sem logo, `logoUrl: null`.
    let logoPorGrupo: Map<string, string>;
    try {
      [data, logoPorGrupo] = await Promise.all([
        listarClientesDaCarteiraAtiva<(typeof data)[number]>(supabase, "id, razao_social, documento"),
        carregarLogosPorGrupoId(supabase),
      ]);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Falha ao carregar clientes." },
        { status: 500 },
      );
    }

    const deduped = dedupeClientesByDocument(
      data.map(({ id, razao_social, documento, grupo_id }) => ({
        id,
        razao_social,
        documento: documento ?? "",
        logoUrl: grupo_id ? (logoPorGrupo.get(grupo_id) ?? null) : null,
      })),
    );

    return NextResponse.json({ data: deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
