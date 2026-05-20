import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  full_name: z.string().min(2).optional(),
  area: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
  role: z.enum(["admin", "comercial", "controladoria", "financeiro"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_users")
      .update(parsed)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    // Busca auth_user_id antes de deletar
    const { data: appUser, error: fetchError } = await supabase
      .from("app_users")
      .select("auth_user_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    // Remove perfil (FK cascade não é garantido)
    const { error: deleteProfileError } = await supabase
      .from("app_users")
      .delete()
      .eq("id", id);

    if (deleteProfileError) {
      return NextResponse.json({ error: deleteProfileError.message }, { status: 500 });
    }

    // Remove do Auth
    if (appUser.auth_user_id) {
      await supabase.auth.admin.deleteUser(appUser.auth_user_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
