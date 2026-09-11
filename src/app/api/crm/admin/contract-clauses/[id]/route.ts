import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toTitleCasePt } from "@/lib/crm/contract-engine/title-case";

const patchSchema = z.object({
  title:      z.string().min(1).max(200).optional(),
  content:    z.string().optional(),
  category:   z.string().min(1).max(100).optional(),
  sort_order: z.number().int().optional(),
  is_active:  z.boolean().optional(),
  /** Área de CRM_PRACTICE_AREAS; null = cláusula transversal. */
  area_key:   z.string().min(1).max(60).nullable().optional(),
  /** subtype_key do catálogo de propostas; null = cláusula de área inteira/transversal. */
  scope_subtype_key: z.string().min(1).max(120).nullable().optional(),
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

/** PATCH /api/crm/admin/contract-clauses/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "Dados inválidos.", issues: body.error.issues }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const updateData = { ...body.data };
    if (updateData.title !== undefined) updateData.title = toTitleCasePt(updateData.title);
    const { data, error } = await supabase
      .from("contract_clause_templates")
      .update(updateData)
      .eq("id", id)
      .select("id, title, content, category, sort_order, is_active, created_at, updated_at, stable_key, version, status, role, is_required, placeholders, legal_review_note, area_key, scope_subtype_key")
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "Cláusula não encontrada." }, { status: 404 });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar cláusula.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/crm/admin/contract-clauses/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("contract_clause_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao excluir cláusula.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
