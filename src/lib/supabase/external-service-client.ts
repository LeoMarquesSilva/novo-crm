import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

/** Prazo de cada consulta aos bancos externos (SIOE, OrquestrAI). */
export const EXTERNAL_SUPABASE_TIMEOUT_MS = 30_000;

/**
 * Cliente service role para outro projeto Supabase (SIOE, OrquestrAI), sem sessão e com
 * prazo por requisição: uma consulta travada não segura a rota até o `maxDuration`.
 */
export function createExternalServiceClient(
  url: string,
  key: string,
  options: { timeoutMs?: number } = {},
): SupabaseClient {
  const timeoutMs = options.timeoutMs ?? EXTERNAL_SUPABASE_TIMEOUT_MS;
  const timedFetch: typeof fetch = (input, init) => fetchWithTimeout(input, init, timeoutMs);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: timedFetch },
  });
}
