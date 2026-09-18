import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncCarteiraGrupos } from "@/lib/sioe/sync-carteira";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";

export const maxDuration = 120;

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    const supabase = createSupabaseAdminClient();
    const [{ data: grupos, error: gruposError }, { data: clientes, error: clientesError }, { data: titulos, error: titulosError }] =
      await Promise.all([
        supabase
          .from("grupos_economicos")
          .select("id, nome, chave_estavel, status, last_synced_at")
          .order("nome"),
        supabase
          .from("clientes")
          .select("id, razao_social, documento, email_principal, telefone_principal, grupo_id, tipo")
          .order("razao_social"),
        supabase.from("grupo_titulos_resumo").select("*"),
      ]);
    if (gruposError) throw gruposError;
    if (clientesError) throw clientesError;
    if (titulosError) throw titulosError;
    return NextResponse.json({
      ok: true,
      data: {
        grupos: grupos ?? [],
        clientes: clientes ?? [],
        titulos: titulos ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar carteira.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
      return NextResponse.json({ ok: false, error: "Sem permissão para sincronizar a carteira." }, { status: 403 });
    }
    const result = await syncCarteiraGrupos(createSupabaseAdminClient());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar carteira.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
