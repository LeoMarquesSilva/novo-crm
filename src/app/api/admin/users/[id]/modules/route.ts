/**
 * PATCH /api/admin/users/[id]/modules — libera ou retira um módulo do usuário
 * (switch em Configurações → Usuários). Só admin; grava em app_user_module_access
 * pela service role.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/auth/server";
import { CRM_MODULES } from "@/lib/auth/crm-access-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  module: z.enum(CRM_MODULES),
  enabled: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "Usuário inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { module, enabled } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data: target, error: targetError } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ ok: false, error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  const { error } = enabled
    ? await supabase
        .from("app_user_module_access")
        .upsert(
          { app_user_id: id, module, granted_by: auth.profile.id, granted_at: new Date().toISOString() },
          { onConflict: "app_user_id,module" },
        )
    : await supabase.from("app_user_module_access").delete().eq("app_user_id", id).eq("module", module);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, module, enabled });
}
