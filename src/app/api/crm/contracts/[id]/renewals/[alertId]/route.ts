import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const bodySchema = z.object({
  assigneeId: uuid.nullable().optional(),
  customerNotifiedAt: z.string().datetime().nullable().optional(),
  decision: z.string().trim().max(500).nullable().optional(),
  appliedIndex: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  conclusion: z.string().trim().max(500).nullable().optional(),
  concluded: z.boolean().optional(),
});
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ id: string; alertId: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  const params = await context.params;
  if (!uuid.safeParse(params.id).success || params.alertId !== "open") return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("contrato_alertas")
    .select("id, contrato_id, data_base, data_vencimento, status, responsavel_app_user_id, cliente_notificado_em, decisao, resolucao, updated_at")
    .eq("contrato_id", params.id)
    .eq("tipo", "contrato_renovacao_pendente")
    .order("data_base", { ascending: false });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, alerts: data ?? [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; alertId: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "manage_renewal" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  }
  const params = await context.params;
  const parsedParams = z.object({ id: uuid, alertId: uuid }).safeParse(params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !body.success) return json({ ok: false, code: "INVALID_REQUEST", issues: body.success ? [] : body.error.issues }, 400);

  const now = new Date().toISOString();
  const resolution = JSON.stringify({
    appliedIndex: body.data.appliedIndex ?? null,
    notes: body.data.notes ?? null,
    conclusion: body.data.conclusion ?? null,
  });
  const update = {
    ...(body.data.assigneeId !== undefined ? { responsavel_app_user_id: body.data.assigneeId } : {}),
    ...(body.data.customerNotifiedAt !== undefined ? {
      cliente_notificado_em: body.data.customerNotifiedAt,
      cliente_notificado_por: body.data.customerNotifiedAt ? auth.profile.id : null,
    } : {}),
    ...(body.data.decision !== undefined ? { decisao: body.data.decision } : {}),
    resolucao: resolution,
    ...(body.data.concluded ? { status: "resolvido", resolvido_em: now, resolvido_por: auth.profile.id } : {}),
  };
  const supabase = createSupabaseAdminClient();
  const { data: alert, error } = await supabase.from("contrato_alertas")
    .update(update)
    .eq("id", parsedParams.data.alertId)
    .eq("contrato_id", parsedParams.data.id)
    .eq("tipo", "contrato_renovacao_pendente")
    .select("*")
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!alert) return json({ ok: false, code: "RENEWAL_NOT_FOUND" }, 404);
  await supabase.from("contrato_eventos").insert({
    contrato_id: parsedParams.data.id,
    tipo: body.data.concluded ? "renovacao_concluida" : "renovacao_atualizada",
    titulo: body.data.concluded ? "Renovação concluída" : "Renovação atualizada",
    detalhe: body.data.conclusion ?? body.data.notes ?? body.data.decision ?? null,
    ator_app_user_id: auth.profile.id,
    origem: "crm",
  });
  return json({ ok: true, alert });
}
