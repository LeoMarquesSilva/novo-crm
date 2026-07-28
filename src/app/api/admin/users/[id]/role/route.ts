import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  role: z.enum(["admin", "comercial", "controladoria", "financeiro"]),
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
    const { role } = bodySchema.parse(body);

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc("admin_change_user_role", {
      p_actor: auth.profile.id,
      p_target: id,
      p_next_role: role,
    });

    if (error) {
      return adminMutationRpcError(error.message);
    }

    return NextResponse.json({ ok: true, id, role });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
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
