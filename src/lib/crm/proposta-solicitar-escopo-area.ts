import type { SupabaseClient } from "@supabase/supabase-js";
import type { InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import { dispatchPropostaEscopoChannelNotifications } from "@/lib/crm/proposta-escopo-notify-channels";

/**
 * Reabre notificação de canais para uma área (ex.: comercial a solicitar ao gestor)
 * e dispara `dispatchPropostaEscopoChannelNotifications`.
 */
export async function resetNotificadoSingleAreaAndDispatch(
  supabase: SupabaseClient,
  oportunidadeId: string,
  targetAreaKey: string,
  targetAppUserIds?: string[],
  options?: { originado_por?: InAppNotificationActor | null },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const key = targetAreaKey.trim();
  if (!key) {
    return { ok: false, error: "Área inválida.", status: 400 };
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

  const { data: row, error: rErr } = await supabase
    .from("proposta_escopo_solicitacao")
    .select("id")
    .eq("oportunidade_id", oportunidadeId)
    .eq("area_key", key)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!row?.id) {
    return {
      ok: false,
      error:
        "Não há pedido de escopo para esta área. Confirme que a área está em \"Áreas de escopo\" e salve esse campo.",
      status: 400,
    };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("proposta_escopo_solicitacao")
    .update({ notificado_em: null, updated_at: now })
    .eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };

  await dispatchPropostaEscopoChannelNotifications(supabase, oportunidadeId, {
    areaKeys: [key],
    targetsByArea: targetAppUserIds?.length ? { [key]: targetAppUserIds } : undefined,
    originado_por: options?.originado_por ?? undefined,
  });
  return { ok: true };
}
