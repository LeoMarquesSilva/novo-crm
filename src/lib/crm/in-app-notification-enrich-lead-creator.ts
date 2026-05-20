import type { SupabaseClient } from "@supabase/supabase-js";
import { actorFromAppUserRow, parseOriginadoPor, type InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";

export type EnrichableInAppNotificationRow = {
  id: string;
  tipo: string;
  payload: unknown;
  lida_em: string | null;
  created_at: string;
};

export function extractOportunidadeIdFromNotificationPayload(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const oid = p.oportunidade_id;
  if (typeof oid === "string" && oid.trim()) return oid.trim();
  const leadId = p.leadId;
  if (typeof leadId === "string" && leadId.trim()) return leadId.trim();
  return null;
}

export function asRecordPayload(payload: unknown): Record<string, unknown> {
  if (payload != null && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>) };
  }
  return {};
}

/**
 * Acrescenta `lead_criador` ao JSON quando não há `originado_por` e a oportunidade tem `criado_por`.
 * Requer cliente com permissão de leitura a `app_users` (ex.: admin / service role).
 */
export async function enrichInAppNotificationsWithLeadCreator(
  admin: SupabaseClient,
  rows: EnrichableInAppNotificationRow[],
): Promise<EnrichableInAppNotificationRow[]> {
  const oppIds = new Set<string>();
  for (const row of rows) {
    if (parseOriginadoPor(row.payload)) continue;
    const id = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (id) oppIds.add(id);
  }
  if (oppIds.size === 0) return rows;

  const { data: opps } = await admin
    .from("oportunidades")
    .select("id, criado_por")
    .in("id", [...oppIds]);
  const criadoPorByOpp = new Map<string, string | null>();
  for (const o of opps ?? []) {
    criadoPorByOpp.set(o.id as string, (o.criado_por as string | null) ?? null);
  }

  const creatorIds = new Set<string>();
  for (const oppId of oppIds) {
    const cp = criadoPorByOpp.get(oppId);
    if (cp) creatorIds.add(cp);
  }
  if (creatorIds.size === 0) return rows;

  const { data: creators } = await admin
    .from("app_users")
    .select("id, full_name, avatar_url")
    .in("id", [...creatorIds]);

  const actorByAppUserId = new Map<string, InAppNotificationActor>();
  for (const c of creators ?? []) {
    const a = actorFromAppUserRow(c);
    if (a) actorByAppUserId.set(c.id as string, a);
  }

  const actorByOppId = new Map<string, InAppNotificationActor>();
  for (const oppId of oppIds) {
    const cp = criadoPorByOpp.get(oppId);
    if (!cp) continue;
    const actor = actorByAppUserId.get(cp);
    if (actor) actorByOppId.set(oppId, actor);
  }

  return rows.map((row) => {
    if (parseOriginadoPor(row.payload)) return row;
    const oppId = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (!oppId) return row;
    const actor = actorByOppId.get(oppId);
    if (!actor) return row;
    return {
      ...row,
      payload: { ...asRecordPayload(row.payload), lead_criador: actor },
    };
  });
}
