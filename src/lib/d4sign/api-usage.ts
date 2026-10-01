import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Limite padrão da API D4Sign: 10 requisições por hora **por método**.
 * A central de ajuda descreve o erro como "limite de requisições por hora
 * para o método utilizado" — listar pastas não consome a cota do download.
 * @see https://ajuda.d4sign.com.br/solu%C3%A7%C3%A3o-de-problemas-e-erros-comuns-na-api
 */
export const D4SIGN_HOURLY_LIMIT = 10;

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Método da D4Sign que tem cota própria. É o `endpoint` gravado em
 * `d4sign_api_usage`, exceto a listagem do cofre: raiz e pasta usam a mesma
 * rota (`/documents/{safe}/safe[/{folder}]`) e dividem a cota por precaução.
 */
export type D4SignQuotaMethod =
  | "documents/cancel"
  | "documents/download"
  | "documents/generate-document-view"
  | "documents/list"
  | "documents/safe"
  | "documents/signaturelink"
  | "documents/status"
  | "folders/find";

const METHOD_ENDPOINTS: Record<D4SignQuotaMethod, string[]> = {
  "documents/cancel": ["documents/cancel"],
  "documents/download": ["documents/download"],
  "documents/generate-document-view": ["documents/generate-document-view"],
  "documents/list": ["documents/list"],
  "documents/safe": ["documents/safe", "documents/safe/folder"],
  "documents/signaturelink": ["documents/signaturelink"],
  "documents/status": ["documents/status"],
  "folders/find": ["folders/find"],
};

export type D4SignQuotaStatus = {
  /** Método medido (cada método tem sua própria janela de 10 req/h). */
  method: D4SignQuotaMethod;
  used: number;
  limit: number;
  remaining: number;
  /** Quando a requisição mais antiga da janela expira (próximo slot). */
  resetAt: string | null;
  /** Última sync bem-sucedida de documentos no banco. */
  lastSyncedAt: string | null;
};

export type LogD4SignApiCallInput = {
  endpoint: string;
  method?: string;
  source?: string;
  httpStatus?: number | null;
};

/** Registra uma chamada à API (fire-and-forget). */
export function logD4SignApiCall(input: LogD4SignApiCallInput): void {
  void (async () => {
    try {
      const supabase = createSupabaseAdminClient();
      await supabase.from("d4sign_api_usage").insert({
        endpoint: input.endpoint,
        method: (input.method ?? "GET").toUpperCase(),
        source: input.source ?? null,
        http_status: input.httpStatus ?? null,
      });
    } catch {
      // não bloqueia fluxo principal
    }
  })();
}

/** Conta requisições bem-sucedidas (2xx) do método na última hora. */
export async function getD4SignQuotaStatus(
  method: D4SignQuotaMethod,
): Promise<D4SignQuotaStatus> {
  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const endpoints = METHOD_ENDPOINTS[method];

  const [{ count }, { data: oldest }, { data: lastDoc }] = await Promise.all([
    supabase
      .from("d4sign_api_usage")
      .select("*", { count: "exact", head: true })
      .in("endpoint", endpoints)
      .gte("created_at", since)
      .gte("http_status", 200)
      .lt("http_status", 300),
    supabase
      .from("d4sign_api_usage")
      .select("created_at")
      .in("endpoint", endpoints)
      .gte("created_at", since)
      .gte("http_status", 200)
      .lt("http_status", 300)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("d4sign_documents")
      .select("last_synced_at")
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const used = count ?? 0;
  const resetAt = oldest?.created_at
    ? new Date(new Date(oldest.created_at).getTime() + WINDOW_MS).toISOString()
    : null;

  return {
    method,
    used,
    limit: D4SIGN_HOURLY_LIMIT,
    remaining: Math.max(0, D4SIGN_HOURLY_LIMIT - used),
    resetAt,
    lastSyncedAt: lastDoc?.last_synced_at ?? null,
  };
}

export function isD4SignQuotaExhausted(quota: Pick<D4SignQuotaStatus, "remaining">): boolean {
  return quota.remaining <= 0;
}

/** Converte data D4Sign (formato livre) para ISO ou null. */
export function safeD4SignIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
