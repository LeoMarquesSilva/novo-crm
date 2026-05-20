import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { dedupeClientesByDocument } from "@/lib/crm/dedupe-clientes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, documento")
      .order("razao_social", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deduped = dedupeClientesByDocument(data ?? []);

    return NextResponse.json({ data: deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
