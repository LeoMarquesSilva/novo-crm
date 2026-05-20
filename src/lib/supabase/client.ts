import { createBrowserClient } from "@supabase/ssr";
import { getAppEnv } from "@/lib/env";

export function createSupabaseClient() {
  const env = getAppEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
