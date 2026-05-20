import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { loadDocumentTemplates } from "@/lib/crm/proposta-document-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const templates = await loadDocumentTemplates(supabase);
    return NextResponse.json({ ok: true, data: templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar modelos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
