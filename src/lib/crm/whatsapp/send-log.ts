import type { SupabaseClient } from "@supabase/supabase-js";

import { IntegrationError } from "@/lib/http/api-errors";

/**
 * Registro do envio no histórico do lead (`lead_activity_events`, kind `whatsapp_enviado`). O índice único
 * (oportunidade_id, kind, source_id) faz do registro uma trava: a mesma mensagem (mesmo `sourceId`) não sai
 * duas vezes, mesmo com duas respostas ao mesmo tempo. Funciona sem coluna nova.
 * Envio anterior que falhou não trava: quando o mesmo evento acontece de novo, a mensagem é tentada outra vez.
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
  if ((error as { code?: string }).code === "23505") return reclaimFailedWhatsappSend(supabase, input);
  // Falha ao registrar não pode calar o aviso: manda mesmo assim.
  console.warn("[whatsapp] histórico do envio:", error.message);
  return true;
}

/**
 * O registro existe: só volta a valer como trava livre se o envio anterior falhou. O update condicional
 * (`falhou = true`) deixa uma única nova tentativa passar quando duas chegam juntas.
 */
async function reclaimFailedWhatsappSend(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; sourceId: string; title: string; text: string },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("lead_activity_events")
    .update({ title: input.title, detail: input.text, metadata: { canal: "whatsapp", nova_tentativa: true } })
    .eq("oportunidade_id", input.oportunidadeId)
    .eq("kind", "whatsapp_enviado")
    .eq("source_id", input.sourceId)
    .eq("metadata->>falhou", "true")
    .select("id");
  if (error) {
    console.warn("[whatsapp] nova tentativa do envio:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** O envio falhou depois da trava: o histórico diz isso; o próximo evento igual tenta de novo. */
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

/** Registro do envio (`null` quando a mensagem ainda não saiu nem foi tentada). */
export async function findWhatsappSend(
  supabase: SupabaseClient,
  input: { oportunidadeId: string; sourceId: string },
): Promise<{ text: string; failed: boolean } | null> {
  const { data, error } = await supabase
    .from("lead_activity_events")
    .select("detail, metadata")
    .eq("oportunidade_id", input.oportunidadeId)
    .eq("kind", "whatsapp_enviado")
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { detail: string | null; metadata: { falhou?: boolean } | null };
  return { text: String(row.detail ?? ""), failed: row.metadata?.falhou === true };
}

/**
 * Vale uma nova tentativa imediata: queda de rede ou 5xx da Evolution. Tempo esgotado não (a mensagem pode
 * ter saído e chegaria duas vezes), nem 4xx ou WhatsApp não configurado.
 */
export function isTransientWhatsappError(error: unknown): boolean {
  if (error instanceof IntegrationError) return (error.httpStatus ?? 0) >= 500;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return false;
  return true;
}

/** Envia; em erro passageiro espera um pouco e tenta mais uma vez (só uma). */
export async function withOneWhatsappRetry<T>(send: () => Promise<T>, delayMs = 1500): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isTransientWhatsappError(error)) throw error;
    console.warn("[whatsapp] nova tentativa:", error instanceof Error ? error.message : String(error));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return send();
  }
}
