import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Registro do envio no histórico do lead (`lead_activity_events`, kind `whatsapp_enviado`). O índice único
 * (oportunidade_id, kind, source_id) faz do registro uma trava: a mesma mensagem (mesmo `sourceId`) não sai
 * duas vezes, mesmo com duas respostas ao mesmo tempo. Funciona sem coluna nova.
 */
export async function claimWhatsappSend(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; sourceId: string; title: string; text: string },
): Promise<boolean> {
  const { error } = await supabase.from("lead_activity_events").insert({
    oportunidade_id: input.oportunidadeId,
    kind: "whatsapp_enviado",
    title: input.title,
    detail: input.text,
    metadata: { canal: "whatsapp" },
    source_id: input.sourceId,
  });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  // Falha ao registrar não pode calar o aviso: manda mesmo assim.
  console.warn("[whatsapp] histórico do envio:", error.message);
  return true;
}

/** O envio falhou depois da trava: o histórico diz isso (e a trava fica, para não insistir em loop). */
export async function markWhatsappSendFailed(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; sourceId: string; title: string },
): Promise<void> {
  await supabase
    .from("lead_activity_events")
    .update({ title: `${input.title} (falhou)`, metadata: { canal: "whatsapp", falhou: true } })
    .eq("oportunidade_id", input.oportunidadeId)
    .eq("kind", "whatsapp_enviado")
    .eq("source_id", input.sourceId);
}
