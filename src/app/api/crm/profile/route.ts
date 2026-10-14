import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthApi } from "@/lib/auth/server";
import { logServerError } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * O próprio usuário só altera nome e foto. Papel e área são definidos pelo
 * administrador (`/api/admin/users/*`) e não são aceitos aqui.
 */
const profileSchema = z
  .object({
    full_name: z.string().trim().min(2, "Informe o nome completo.").max(120),
    avatar_url: z
      .string()
      .trim()
      .max(2048)
      .url("URL da foto inválida.")
      .refine((u) => u.startsWith("https://"), "A foto precisa de um endereço https.")
      .nullable(),
  })
  .strict();

export async function PATCH(request: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("app_users")
    .update({ full_name: parsed.data.full_name, avatar_url: parsed.data.avatar_url })
    .eq("id", auth.profile.id);

  if (error) {
    const ref = logServerError("crm/profile", error, { appUserId: auth.profile.id });
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar o perfil.", ref },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
