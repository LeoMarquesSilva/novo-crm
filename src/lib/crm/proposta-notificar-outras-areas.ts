import type { SupabaseClient } from "@supabase/supabase-js";
import { appUserAreaMatchesScopeKey } from "@/lib/crm/area-keys-alignment";
import type { InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import { dispatchPropostaEscopoChannelNotifications } from "@/lib/crm/proposta-escopo-notify-channels";

/**
 * Reabre o envio de canais para áreas ainda não concluídas (exceto a do usuário)
 * e dispara `dispatchPropostaEscopoChannelNotifications`.
 * Espera-se que o gestor já tenha concluído o escopo da própria área.
 */
export async function resetNotificadoAndDispatchOtherPendingAreas(
  supabase: SupabaseClient,
  oportunidadeId: string,
  viewerAreaKey: string,
  targetsByArea?: Record<string, string[]>,
  options?: { originado_por?: InAppNotificationActor | null },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const trimmed = viewerAreaKey.trim();
  if (!trimmed) {
    return { ok: false, error: "Área do usuário não definida.", status: 403 };
  }

  const { data: op, error: opErr } = await supabase
    .from("oportunidades")
    .select("etapa")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opErr) return { ok: false, error: opErr.message };
  if (op?.etapa !== "confeccao_proposta") {
    return { ok: false, error: "A oportunidade não está na etapa de elaboração da proposta.", status: 400 };
  }

  const { data: solicitacoes, error } = await supabase
    .from("proposta_escopo_solicitacao")
    .select("id, area_key, concluido_em")
    .eq("oportunidade_id", oportunidadeId);
  if (error) return { ok: false, error: error.message };

  const rows = solicitacoes ?? [];
  const mine = rows.find((r) => appUserAreaMatchesScopeKey(trimmed, r.area_key));
  if (!mine?.concluido_em) {
    return {
      ok: false,
      error: "Conclua o escopo da sua área antes de notificar as outras.",
      status: 400,
    };
  }

  const othersPending = rows.some(
    (r) => !appUserAreaMatchesScopeKey(trimmed, r.area_key) && !r.concluido_em,
  );
  if (!othersPending) {
    return {
      ok: false,
      error: "Não há outras áreas pendentes nesta oportunidade.",
      status: 400,
    };
  }

  const now = new Date().toISOString();
  const toReset = rows.filter(
    (r) => !appUserAreaMatchesScopeKey(trimmed, r.area_key) && !r.concluido_em,
  );
  for (const r of toReset) {
    const { error: upErr } = await supabase
      .from("proposta_escopo_solicitacao")
      .update({ notificado_em: null, updated_at: now })
      .eq("id", r.id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  await dispatchPropostaEscopoChannelNotifications(supabase, oportunidadeId, {
    areaKeys: toReset.map((r) => r.area_key),
    targetsByArea,
    originado_por: options?.originado_por ?? undefined,
  });
  return { ok: true };
}
