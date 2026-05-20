/**
 * GET /api/crm/d4sign/health
 * Painel de saúde D4Sign (admin/comercial).
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { countDocumentsNeedingEnrich } from "@/lib/d4sign/enrich-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const supabase = createSupabaseAdminClient();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const staleBefore = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const [
      quota,
      withoutSigners,
      { count: totalDocs },
      { count: missingNames },
      { count: stalePending },
      { count: fromCrm },
      { data: lastWebhook },
      { data: usageRows },
    ] = await Promise.all([
      getD4SignQuotaStatus(),
      countDocumentsNeedingEnrich(),
      supabase.from("d4sign_documents").select("*", { count: "exact", head: true }),
      supabase
        .from("d4sign_documents")
        .select("*", { count: "exact", head: true })
        .is("name_document", null),
      supabase
        .from("d4sign_documents")
        .select("*", { count: "exact", head: true })
        .in("d4sign_status", ["2", "3", "sent", "processing"])
        .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`),
      supabase
        .from("d4sign_documents")
        .select("*", { count: "exact", head: true })
        .not("sent_by_app_user_id", "is", null),
      supabase
        .from("d4sign_webhook_events")
        .select("created_at, type_post, document_uuid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("d4sign_api_usage")
        .select("endpoint, source, created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const usageBySource: Record<string, number> = {};
    for (const row of usageRows ?? []) {
      const key = row.source ?? "unknown";
      usageBySource[key] = (usageBySource[key] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      quota,
      documents: {
        total: totalDocs ?? 0,
        from_crm: fromCrm ?? 0,
        from_vault: (totalDocs ?? 0) - (fromCrm ?? 0),
        without_signers: withoutSigners,
        missing_names: missingNames ?? 0,
        stale_pending: stalePending ?? 0,
      },
      webhook: {
        last_at: lastWebhook?.created_at ?? null,
        last_type: lastWebhook?.type_post ?? null,
        last_document: lastWebhook?.document_uuid ?? null,
      },
      usage_24h: {
        total: usageRows?.length ?? 0,
        by_source: usageBySource,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar saúde.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
