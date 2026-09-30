import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.string().uuid();
const bodySchema = z.object({
  reviewedFieldKeys: z.array(z.string().trim().min(1)).max(40),
});

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) {
    const code = auth.response.status === 401 ? "UNAUTHENTICATED" : "PROFILE_REQUIRED";
    return json({ ok: false, code, error: "Autenticação necessária." }, auth.response.status);
  }
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para revisar o contrato." }, 403);
  }

  const params = z.object({ id: uuid }).safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return json({ ok: false, code: "INVALID_REQUEST", error: "Requisição inválida." }, 400);
  }

  const supabase = createSupabaseAdminClient();
  const { data: version, error } = await supabase
    .from("contrato_versoes")
    .select("id, origem_snapshot, updated_at")
    .eq("contrato_id", params.data.id)
    .eq("status", "rascunho")
    .maybeSingle();
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  if (!version) return json({ ok: false, code: "CONTRACT_NOT_FOUND", error: "Não há rascunho para revisar." }, 404);

  const current =
    version.origem_snapshot && typeof version.origem_snapshot === "object" && !Array.isArray(version.origem_snapshot)
      ? (version.origem_snapshot as Record<string, unknown>)
      : {};
  const { data: updated, error: updateError } = await supabase
    .from("contrato_versoes")
    .update({
      origem_snapshot: {
        ...current,
        reviewedFieldKeys: [...new Set(body.data.reviewedFieldKeys)],
      } as Json,
      atualizado_por: auth.profile.id,
    })
    .eq("id", version.id)
    .select("updated_at")
    .maybeSingle();
  if (updateError) return json({ ok: false, code: "INTERNAL_ERROR", error: updateError.message }, 500);

  return json({
    ok: true,
    reviewedFieldKeys: [...new Set(body.data.reviewedFieldKeys)],
    updatedAt: updated?.updated_at ?? version.updated_at,
  }, 200);
}
