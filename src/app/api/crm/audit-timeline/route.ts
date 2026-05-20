import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

const LIMIT = 40;

function stageLabel(code: string): string {
  return OPPORTUNITY_STAGE_LABELS[code as OpportunityStage] ?? code;
}

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .from("transicoes_etapa")
      .select("id, oportunidade_id, etapa_origem, etapa_destino, criado_em, alterado_por, observacao")
      .order("criado_em", { ascending: false })
      .limit(LIMIT);

    if (error) {
      throw error;
    }

    const list = rows ?? [];
    const userIds = [...new Set(list.map((r) => r.alterado_por).filter(Boolean))] as string[];
    const oppIds = [...new Set(list.map((r) => r.oportunidade_id))];

    const [{ data: usersRows }, { data: oppsRows }] = await Promise.all([
      userIds.length
        ? supabase.from("app_users").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      oppIds.length
        ? supabase.from("oportunidades").select("id, solicitante_nome").in("id", oppIds)
        : Promise.resolve({ data: [] as { id: string; solicitante_nome: string }[] }),
    ]);

    const nameByUserId = new Map<string, string>();
    for (const u of usersRows ?? []) {
      nameByUserId.set(u.id, u.full_name);
    }

    const solicitanteByOppId = new Map<string, string>();
    for (const o of oppsRows ?? []) {
      solicitanteByOppId.set(o.id, o.solicitante_nome);
    }

    const items = list.map((row) => {
      const actor = row.alterado_por
        ? nameByUserId.get(row.alterado_por) ?? "Usuário"
        : "Importação / sistema";
      return {
        id: row.id,
        actor,
        from: stageLabel(row.etapa_origem),
        to: stageLabel(row.etapa_destino),
        at: formatDateTimeBr(row.criado_em),
        leadName: solicitanteByOppId.get(row.oportunidade_id) ?? null,
        observacao: row.observacao,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar a timeline de auditoria.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
