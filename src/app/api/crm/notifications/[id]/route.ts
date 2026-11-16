import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Marca um aviso como lido (padrão, corpo vazio) ou como não lido (`{ "read": false }`).
 * Corpo vazio continua valendo: o service worker e versões antigas mandam PATCH sem corpo.
 */
async function readFlag(request: Request): Promise<boolean | null> {
  const raw = await request.text().catch(() => "");
  if (!raw.trim()) return true;
  try {
    const body = JSON.parse(raw) as { read?: unknown };
    if (body.read === undefined) return true;
    return typeof body.read === "boolean" ? body.read : null;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }

  const read = await readFlag(request);
  if (read === null) {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const lidaEm = read ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("crm_in_app_notifications")
    .update({ lida_em: lidaEm })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lida_em: lidaEm });
}
