import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
const bodySchema = z.object({ competency, versionId: uuid, items: z.array(item).max(200) });
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  const params = z.object({ id: uuid }).safeParse(await context.params);
  const query = z.object({ competency }).safeParse({ competency: new URL(request.url).searchParams.get("competency") });
  if (!params.success || !query.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  const { data, error } = await createSupabaseAdminClient().from("contrato_consumos_mensais").select("*")
    .eq("contrato_id", params.data.id).eq("competencia", query.data.competency).order("created_at");
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  return json({ ok: true, items: data });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "prepare_closing" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  }
  const params = z.object({ id: uuid }).safeParse(await context.params);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !parsed.success) return json({ ok: false, code: "INVALID_REQUEST", issues: parsed.success ? [] : parsed.error.issues }, 400);
  const supabase = createSupabaseAdminClient();
  const [{ data: version }, { data: closing }] = await Promise.all([
    supabase.from("contrato_versoes").select("id").eq("id", parsed.data.versionId).eq("contrato_id", params.data.id).maybeSingle(),
    supabase.from("contrato_fechamentos").select("status").eq("contrato_id", params.data.id).eq("competencia", parsed.data.competency).maybeSingle(),
  ]);
  if (!version) return json({ ok: false, code: "CONTRACT_VERSION_NOT_FOUND" }, 404);
  if (closing?.status === "aprovado" || closing?.status === "lancado_vios") return json({ ok: false, code: "APPROVED_CLOSING_IMMUTABLE" }, 409);
  const componentIds = parsed.data.items.flatMap((entry) => entry.componentId ? [entry.componentId] : []);
  const areaIds = parsed.data.items.flatMap((entry) => entry.areaId ? [entry.areaId] : []);
  const [components, areas] = await Promise.all([
    componentIds.length ? supabase.from("contrato_componentes_cobranca").select("id").eq("versao_id", version.id).in("id", componentIds) : Promise.resolve({ data: [] }),
    areaIds.length ? supabase.from("contrato_areas").select("id").eq("versao_id", version.id).in("id", areaIds) : Promise.resolve({ data: [] }),
  ]);
  if ((components.data?.length ?? 0) !== new Set(componentIds).size || (areas.data?.length ?? 0) !== new Set(areaIds).size) {
    return json({ ok: false, code: "INVALID_CONTRACT_MEMBERSHIP" }, 422);
  }
  const rows = parsed.data.items.map((entry) => ({
    id: entry.id ?? randomUUID(), contrato_id: params.data.id, versao_id: parsed.data.versionId,
    competencia: parsed.data.competency, componente_id: entry.componentId, area_id: entry.areaId,
    tipo: entry.kind, quantidade: entry.quantity, valor: entry.amount, evidencia_url: entry.evidenceUrl ?? null,
    observacao: entry.note ?? null, informado_por: auth.profile.id,
  }));
  const { data, error } = await supabase.from("contrato_consumos_mensais").upsert(rows).select("*");
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  return json({ ok: true, items: data });
}
