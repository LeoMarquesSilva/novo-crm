import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), expectedRevision: z.number().int().positive() }),
  z.object({ action: z.literal("new_revision"), previousRevisionId: uuid, expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3) }),
  z.object({ action: z.literal("register_vios"), expectedRevision: z.number().int().positive(), reference: z.string().trim().min(1), url: z.string().url().optional() }),
  z.object({ action: z.literal("resolve_blocker"), itemId: uuid, resolution: z.enum(["nao_cobrar", "ajuste", "aditivo"]), reason: z.string().trim().min(3) }),
]);
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function paramsOf(context: { params: Promise<{ id: string; closingId: string }> }) {
  return z.object({ id: uuid, closingId: uuid }).safeParse(await context.params);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; closingId: string }> }) {
  const auth = await requireAuthApi(); if (!auth.ok) return auth.response;
  const params = await paramsOf(context); if (!params.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  const supabase = createSupabaseAdminClient();
  const { data: closing, error } = await supabase.from("contrato_fechamentos").select("*").eq("id", params.data.closingId).eq("contrato_id", params.data.id).maybeSingle();
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  if (!closing) return json({ ok: false, code: "CLOSING_NOT_FOUND" }, 404);
  const [revisions, consumptions] = await Promise.all([
    supabase.from("contrato_fechamento_revisoes").select("*").eq("fechamento_id", closing.id).order("numero", { ascending: false }),
    supabase.from("contrato_consumos_mensais").select("*").eq("contrato_id", params.data.id).eq("competencia", closing.competencia).order("created_at"),
  ]);
  const revisionIds = (revisions.data ?? []).map((entry) => entry.id);
  const items = revisionIds.length ? await supabase.from("contrato_fechamento_itens").select("*").in("revisao_id", revisionIds).order("created_at") : { data: [], error: null };
  return json({ ok: true, closing, revisions: revisions.data ?? [], items: items.data ?? [], consumptions: consumptions.data ?? [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; closingId: string }> }) {
  const auth = await requireAuthApi(); if (!auth.ok) return auth.response;
  const params = await paramsOf(context);
  const body = actionSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return json({ ok: false, code: "INVALID_REQUEST", issues: body.success ? [] : body.error.issues }, 400);
  const capability = body.data.action === "approve" || body.data.action === "new_revision" ? "approve_closing" : body.data.action === "register_vios" ? "register_vios" : "prepare_closing";
  if (!canAccessContractCapability({ role: auth.profile.role, capability })) return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  const supabase = createSupabaseAdminClient();
  try {
    if (body.data.action === "resolve_blocker") {
      const { data: closing } = await supabase.from("contrato_fechamentos").select("revisao_atual_id,status").eq("id", params.data.closingId).eq("contrato_id", params.data.id).maybeSingle();
      if (!closing?.revisao_atual_id) return json({ ok: false, code: "CLOSING_NOT_FOUND" }, 404);
      if (closing.status !== "em_revisao") return json({ ok: false, code: "APPROVED_CLOSING_IMMUTABLE" }, 409);
      const { data, error } = await supabase.from("contrato_fechamento_itens").update({
        resolucao: `${body.data.resolution}: ${body.data.reason}`, resolvido_em: new Date().toISOString(), resolvido_por: auth.profile.id,
      }).eq("id", body.data.itemId).eq("revisao_id", closing.revisao_atual_id).eq("bloqueante", true).select("*").maybeSingle();
      if (error) throw error; if (!data) return json({ ok: false, code: "BLOCKER_NOT_FOUND" }, 404);
      return json({ ok: true, item: data });
    }
    const rpc = body.data.action === "approve"
      ? await supabase.rpc("approve_contract_closing_revision", { p_actor_id: auth.profile.id, p_closing_id: params.data.closingId, p_expected_revision: body.data.expectedRevision })
      : body.data.action === "new_revision"
        ? await supabase.rpc("create_contract_closing_correction", { p_actor_id: auth.profile.id, p_closing_id: params.data.closingId, p_expected_revision: body.data.expectedRevision, p_previous_revision_id: body.data.previousRevisionId, p_reason: body.data.reason })
        : await supabase.rpc("register_contract_closing_vios", { p_actor_id: auth.profile.id, p_closing_id: params.data.closingId, p_expected_revision: body.data.expectedRevision, p_reference: body.data.reference, p_url: body.data.url ?? "" });
    if (rpc.error) throw rpc.error;
    return json({ ok: true, revision: rpc.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar fechamento.";
    const conflict = /CONFLICT|IMMUTABLE|NOT_APPROVED|NOT_REVIEWABLE/.test(message);
    return json({ ok: false, code: conflict ? "CLOSING_CONFLICT" : "CLOSING_INVALID", error: message }, conflict ? 409 : 422);
  }
}
