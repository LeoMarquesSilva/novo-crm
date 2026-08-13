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
    if (parsed.role) {
      const { error: roleError } = await supabase.rpc("admin_change_user_role", {
        p_actor: auth.profile.id,
        p_target: id,
        p_next_role: parsed.role,
      });
      if (roleError) {
        return adminMutationRpcError(roleError.message);
      }
    }

    const { role: _role, ...profileFields } = parsed;
    if (Object.keys(profileFields).length > 0) {
      const { error: updateError } = await supabase
        .from("app_users")
        .update(profileFields)
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("app_users")
      .select()
      .eq("id", id)
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

    const { data: authUserId, error: deleteError } = await supabase.rpc(
      "admin_delete_user",
      {
        p_actor: auth.profile.id,
        p_target: id,
      },
    );
    if (deleteError) {
      return adminMutationRpcError(deleteError.message);
    }
    if (!authUserId) {
      return NextResponse.json(
        { error: "Não foi possível localizar a conta de autenticação do usuário." },
        { status: 500 },
      );
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(authUserId);
    if (authDeleteError) {
      console.error("Perfil removido, mas a conta Auth não foi excluída", {
        appUserId: id,
        error: authDeleteError,
      });
      return NextResponse.json(
        { error: "O perfil foi removido, mas a conta de autenticação precisa de limpeza administrativa." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function adminMutationRpcError(message: string): NextResponse {
  if (message === "USER_NOT_FOUND") {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  if (
    message === "Não é possível excluir a própria conta administrativa." ||
    message === "Não é possível excluir o último administrador." ||
    message === "Não é possível remover o papel do último administrador."
  ) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (message === "ADMIN_MUTATION_FORBIDDEN") {
    return NextResponse.json({ error: "Sem permissão para alterar usuários." }, { status: 403 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
