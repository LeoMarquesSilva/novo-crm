import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Action = "aprovar" | "mesclar";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action || !["aprovar", "mesclar"].includes(body.action)) {
    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const targetStatus = body.action === "aprovar" ? "aprovado" : "mesclado";
  const approvedAt = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("indicadores")
    .update({
      status: targetStatus,
      aprovado_por: auth.profile.id,
      aprovado_em: approvedAt,
    })
    .eq("id", id)
    .eq("status", "pendente_aprovacao")
    .select("id, nome, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "Indicador não encontrado ou já foi processado." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, data: updated });
}
