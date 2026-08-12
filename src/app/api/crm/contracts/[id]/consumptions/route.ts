import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.string().uuid();
const competency = z.string().regex(/^\d{4}-\d{2}-01$/);
const item = z.object({
  id: uuid.optional(),
  componentId: uuid.nullable(),
  areaId: uuid.nullable(),
  kind: z.enum(["processo", "hora", "quilometro", "valor_manual"]),
  quantity: z.number().nonnegative().nullable(),
  amount: z.number().nonnegative().nullable(),
  evidenceUrl: z.string().url().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.kind === "valor_manual" ? value.amount === null || value.quantity !== null : value.quantity === null || value.amount !== null) {
    context.addIssue({ code: "custom", message: "Informe quantidade ou valor conforme o tipo." });
  }
});
const resolution = z.object({ componentId: uuid, released: z.boolean(), amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(), base: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(), reason: z.string().trim().max(1000).nullable() });
const writeSchema = z.object({ competency, versionId: uuid, items: z.array(item).max(200), resolutions: z.array(resolution).max(200) });
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  const params = z.object({ id: uuid }).safeParse(await context.params);
  const query = z.object({ competency }).safeParse({ competency: new URL(request.url).searchParams.get("competency") });
  if (!params.success || !query.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("contrato_consumos_mensais").select("*").eq("contrato_id", params.data.id).eq("competencia", query.data.competency).order("created_at");
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  const { data: version } = await supabase.from("contrato_versoes").select("id").eq("contrato_id", params.data.id).eq("status", "ativa").lte("vigente_de", query.data.competency).or(`vigente_ate.is.null,vigente_ate.gte.${query.data.competency}`).limit(1).maybeSingle();
  if (!version) return json({ ok: true, versionId: null, items: data, resolutions: [], components: [], areas: [] });
  const [resolutions, components, areas] = await Promise.all([
    supabase.from("contrato_resolucoes_mensais").select("componente_id,liberado,valor,base_calculo,motivo").eq("contrato_id", params.data.id).eq("versao_id", version.id).eq("competencia", query.data.competency),
    supabase.from("contrato_componentes_cobranca").select("id,descricao,tipo,area_id,liberacao_manual_necessaria").eq("versao_id", version.id).order("ordem"),
    supabase.from("contrato_areas").select("id,area_key").eq("versao_id", version.id).order("area_key"),
  ]);
  return json({ ok: true, versionId: version.id, items: data, resolutions: resolutions.data ?? [], components: components.data ?? [], areas: areas.data ?? [] });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "prepare_closing" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  }
  const params = z.object({ id: uuid }).safeParse(await context.params);
  const parsed = writeSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !parsed.success) return json({ ok: false, code: "INVALID_REQUEST", issues: parsed.success ? [] : parsed.error.issues }, 400);
  const supabase = createSupabaseAdminClient();
  const rpcItems = JSON.parse(JSON.stringify(parsed.data.items)) as Json;
  const rpcResolutions = JSON.parse(JSON.stringify(parsed.data.resolutions)) as Json;
  const { data, error } = await supabase.rpc("upsert_contract_consumptions_atomic", {
    p_actor_id: auth.profile.id, p_competencia: parsed.data.competency, p_contract_id: params.data.id,
    p_items: rpcItems, p_resolutions: rpcResolutions, p_version_id: parsed.data.versionId,
  });
  if (error) {
    const status = /NOT_FOUND/.test(error.message) ? 404 : /IMMUTABLE|CONFLICT/.test(error.message) ? 409 : /INVALID/.test(error.message) ? 422 : 500;
    return json({ ok: false, code: "CONSUMPTION_WRITE_FAILED", error: error.message }, status);
  }
  return json({ ok: true, items: data });
}
