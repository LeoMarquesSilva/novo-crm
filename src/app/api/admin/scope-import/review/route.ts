import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadScopeImportCombinedReview } from "@/lib/scope-import/batch-state";

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const data = await loadScopeImportCombinedReview(supabase);

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar revisão combinada.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
