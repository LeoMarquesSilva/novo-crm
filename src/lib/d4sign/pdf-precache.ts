/**
 * Pré-cache de PDFs no Supabase Storage (1 req D4Sign por doc novo).
 */
import { getD4SignEnv } from "@/lib/d4sign/env";
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "d4sign-contracts";

export async function precacheD4SignPdfs(uuids: string[]): Promise<{ cached: number; skipped: number }> {
  if (uuids.length === 0) return { cached: 0, skipped: 0 };

  const env = getD4SignEnv();
  if (!env.tokenApi) return { cached: 0, skipped: uuids.length };

  const supabase = createSupabaseAdminClient();
  let cached = 0;
  let skipped = 0;

  for (const uuid of uuids) {
    const filePath = `${uuid}.pdf`;
    const { data: existing } = await supabase.storage.from(BUCKET).list("", {
      search: filePath,
      limit: 1,
    });
    if (existing?.some((f) => f.name === filePath)) {
      skipped += 1;
      continue;
    }

    const qs = new URLSearchParams({
      tokenAPI: env.tokenApi,
      ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}),
      type: "0",
    });

    try {
      const res = await fetch(
        `${env.apiBaseUrl}/documents/${uuid}/download?${qs.toString()}`,
        { cache: "no-store" },
      );
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "GET",
        source: "cron-precache",
        httpStatus: res.status,
      });
      if (!res.ok) break;

      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) continue;

      const buf = await res.arrayBuffer();
      await supabase.storage
        .from(BUCKET)
        .upload(filePath, buf, { contentType: "application/pdf", upsert: true });
      cached += 1;
    } catch {
      break;
    }
  }

  return { cached, skipped };
}
