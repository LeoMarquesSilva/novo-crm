import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { PASSWORD_RECOVERY_COOKIE, passwordRecoveryCookieOptions } from "@/lib/auth/password-recovery";
import { replacementPasswordSchema } from "@/lib/auth/must-change-password";
import { getCurrentUserProfile } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  password: replacementPasswordSchema,
  confirm: z.string(),
});

export async function POST(request: Request) {
  const jar = await cookies();
  if (jar.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1") {
    return NextResponse.json(
      { ok: false, error: "O link expirou. Peça uma nova redefinição de senha." },
      { status: 403 },
    );
  }

  const { user } = await getCurrentUserProfile({ officialAvatar: false });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Abra de novo o link enviado por e-mail." }, { status: 401 });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, "", {
    ...passwordRecoveryCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
  return response;
}
