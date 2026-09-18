import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncCarteiraGrupos } from "@/lib/sioe/sync-carteira";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { fetchOrqestraiClientGroups } from "@/lib/orqestrai/client-groups";
import { fetchGruposEconomicosCarteira } from "@/lib/crm/fetch-grupos-economicos";
import {
  buildClienteResponsibleAreaIndex,
  legacyCategoriaAsResponsibleArea,
  lookupClienteResponsibleArea,
  origemLinhaFromGrupoCategoria,
  persistCarteiraCategoria,
} from "@/lib/crm/grupo-categoria";
import {
  buildClienteAtividadeIndex,
  lookupClienteAtividade,
} from "@/lib/orqestrai/gestor-atividade";

export const maxDuration = 120;

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    const supabase = createSupabaseAdminClient();
    const [
      { data: grupos, error: gruposError },
      { data: clientes, error: clientesError },
      { data: titulos, error: titulosError },
      orqestraiGroups,
    ] = await Promise.all([
      fetchGruposEconomicosCarteira(supabase),
      supabase
        .from("clientes")
        .select("id, razao_social, documento, email_principal, telefone_principal, grupo_id, tipo")
        .order("razao_social"),
      supabase.from("grupo_titulos_resumo").select("*"),
      fetchOrqestraiClientGroups().catch(() => null),
    ]);
    if (gruposError) throw gruposError;
    if (clientesError) throw clientesError;
    if (titulosError) throw titulosError;
    const atividadeIndex = buildClienteAtividadeIndex(orqestraiGroups ?? []);
    const responsibleAreaIndex = buildClienteResponsibleAreaIndex(orqestraiGroups ?? []);
    return NextResponse.json({
      ok: true,
      data: {
        grupos: (grupos ?? []).map((grupo) => {
          const origemLinha = origemLinhaFromGrupoCategoria(grupo.categoria);
          return {
            ...grupo,
            clienteStatus: lookupClienteAtividade(atividadeIndex, {
              orqestraiId: grupo.orqestrai_id ?? grupo.id,
              groupKey: grupo.chave_estavel,
            }),
            origemLinha,
            categoria: persistCarteiraCategoria(origemLinha),
            responsibleArea:
              lookupClienteResponsibleArea(responsibleAreaIndex, {
                orqestraiId: grupo.orqestrai_id ?? grupo.id,
                groupKey: grupo.chave_estavel,
              }) ?? legacyCategoriaAsResponsibleArea(grupo.categoria),
          };
        }),
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
