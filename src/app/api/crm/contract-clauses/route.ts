import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** GET /api/crm/contract-clauses — cláusulas ativas para o builder (todos autenticados) */
export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .select("id, title, content, category, sort_order")
      .eq("is_active", true)
      .order("category")
      .order("sort_order")
      .order("created_at");

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar cláusulas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
