import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  title:      z.string().min(1).max(200),
  content:    z.string().default(""),
  category:   z.string().min(1).max(100).default("Geral"),
  sort_order: z.number().int().default(0),
});

async function requireAdmin() {
  const auth = await requireAuthApi();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!auth.profile || auth.profile.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Apenas administradores podem gerenciar cláusulas." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, profile: auth.profile };
}

/** GET /api/crm/admin/contract-clauses — todas as cláusulas (admin) */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .select("id, title, content, category, sort_order, is_active, created_at, updated_at")
      .order("category")
      .order("sort_order")
      .order("created_at");

    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar cláusulas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST /api/crm/admin/contract-clauses — cria nova cláusula (admin) */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "Dados inválidos.", issues: body.error.issues }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .insert({ ...body.data, created_by: auth.profile.id })
      .select("id, title, content, category, sort_order, is_active, created_at, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar cláusula.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
