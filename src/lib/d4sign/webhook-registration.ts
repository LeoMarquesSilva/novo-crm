/**
 * Webhook 2.0 no cofre inteiro: uma chamada cobre todo documento do cofre
 * (assinatura, finalização com a lista de signatários, cancelamento, bounce).
 * Substitui o cadastro por documento do 1.0.
 *
 * O cadastro fica marcado em `d4sign_api_usage` (`cursor/webhook-v2`,
 * `source` = URL, `http_status` nulo) e só é refeito se a URL mudar.
 */
import { getD4SignEnv } from "@/lib/d4sign/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export const WEBHOOK_V2_ENDPOINT = "cursor/webhook-v2";

/** URL pública do webhook; null sem domínio conhecido (ex.: dev local). */
export function d4signWebhookUrl(origin?: string | null): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "") ||
    origin?.replace(/\/$/, "") ||
    "";
  if (!/^https:\/\//i.test(base)) return null;
  return `${base}/api/integrations/d4sign/webhook`;
}

export async function ensureSafeWebhookV2(options?: {
  origin?: string | null;
  force?: boolean;
}): Promise<{ registered: boolean; url: string | null; error?: string }> {
  const env = getD4SignEnv();
  const url = d4signWebhookUrl(options?.origin);
  if (!env.tokenApi || !env.safeUuid || !url) return { registered: false, url };

  const supabase = createSupabaseAdminClient();
  if (!options?.force) {
    const { data } = await supabase
      .from("d4sign_api_usage")
      .select("source")
      .eq("endpoint", WEBHOOK_V2_ENDPOINT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.source === url) return { registered: false, url };
  }

  try {
    await D4SignConnector.fromEnv(env).registerWebhookV2("cofre", env.safeUuid, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[D4Sign] cadastro do Webhook 2.0 no cofre falhou", message);
    return { registered: false, url, error: message };
  }

  await supabase.from("d4sign_api_usage").insert({
    endpoint: WEBHOOK_V2_ENDPOINT,
    method: "POST",
    source: url,
    http_status: null,
  });
  return { registered: true, url };
}
