import { NextResponse } from "next/server";
import { z } from "zod";

import { replacementPasswordSchema, userMustChangePassword } from "@/lib/auth/must-change-password";
import { getCurrentUserProfile } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  password: replacementPasswordSchema,
  confirm: z.string(),
});

export async function POST(request: Request) {
  const { user } = await getCurrentUserProfile({ officialAvatar: false });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  if (!userMustChangePassword(user)) {
    return NextResponse.json({ ok: false, error: "Não há troca de senha pendente." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Senha inválida." },
      { status: 400 },
    );
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return NextResponse.json({ ok: false, error: "A confirmação não confere com a nova senha." }, { status: 400 });
  }

  if (!user.email) {
    return NextResponse.json({ ok: false, error: "Conta sem e-mail." }, { status: 400 });
  }
  const sessionClient = await createSupabaseServerClient();
  const { error: samePassword } = await sessionClient.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (!samePassword) {
    return NextResponse.json(
      { ok: false, error: "Escolha uma senha diferente da temporária." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin.auth.admin.getUserById(user.id);
  if (readError || !current.user) {
    return NextResponse.json({ ok: false, error: "Não foi possível atualizar a senha." }, { status: 500 });
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
    app_metadata: { ...current.user.app_metadata, must_change_password: false },
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
