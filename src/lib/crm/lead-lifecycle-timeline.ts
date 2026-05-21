import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarDuracaoBr } from "@/lib/crm/due-diligence-timeline";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import type { LeadActivityKind } from "@/lib/crm/record-lead-activity";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type LeadActivityActor = {
  appUserId: string;
  fullName: string;
  avatarUrl: string | null;
  area: string | null;
};

export type LeadLifecyclePeriod = {
  id: string;
  etapa: OpportunityStage;
  etapaLabel: string;
  enteredAt: string;
  exitedAt: string | null;
  durationMs: number | null;
  durationLabel: string;
  isCurrent: boolean;
  source: string | null;
};

export type LeadActivityEvent = {
  id: string;
  kind: LeadActivityKind;
  title: string;
  detail: string | null;
  etapa: OpportunityStage | null;
  etapaLabel: string | null;
  areaKey: string | null;
  createdAt: string;
  actor: LeadActivityActor | null;
  metadata: Record<string, unknown>;
};

export type LeadLifecycleSummary = {
  leadCreatedAt: string;
  totalDurationMs: number | null;
  totalDurationLabel: string;
  currentEtapa: OpportunityStage | null;
  currentEtapaDurationMs: number | null;
  currentEtapaDurationLabel: string;
  periodCount: number;
  activityCount: number;
};

export type LeadLifecycleTimeline = {
  periods: LeadLifecyclePeriod[];
  activities: LeadActivityEvent[];
  summary: LeadLifecycleSummary;
};

function durationMsBetween(start: string, end: string | null): number | null {
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return null;
  const endMs = end ? Date.parse(end) : Date.now();
  if (!Number.isFinite(endMs)) return null;
  const diff = endMs - startMs;
  return diff >= 0 ? diff : null;
}

function stageLabel(code: string): string {
  return OPPORTUNITY_STAGE_LABELS[code as OpportunityStage] ?? code;
}

async function fetchActivityActors(
  supabase: SupabaseClient,
  appUserIds: string[],
): Promise<Map<string, LeadActivityActor>> {
  const unique = [...new Set(appUserIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from("app_users")
    .select("id, full_name, avatar_url, area")
    .in("id", unique);

  const map = new Map<string, LeadActivityActor>();
  for (const row of data ?? []) {
    const area = row.area != null ? String(row.area).trim() : "";
    map.set(String(row.id), {
      appUserId: String(row.id),
      fullName: String(row.full_name),
      avatarUrl: row.avatar_url ?? null,
      area: area || null,
    });
  }
  return map;
}

export async function fetchLeadLifecycleTimeline(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<LeadLifecycleTimeline> {
  const [{ data: opp }, { data: periodRows }, { data: activityRows }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select("etapa, created_at")
      .eq("id", oportunidadeId)
      .maybeSingle(),
    supabase
      .from("oportunidade_etapa_periodos")
      .select("id, etapa, entered_at, exited_at, source")
      .eq("oportunidade_id", oportunidadeId)
      .order("entered_at", { ascending: true }),
    supabase
      .from("lead_activity_events")
      .select("id, kind, title, detail, etapa, area_key, actor_app_user_id, metadata, created_at")
      .eq("oportunidade_id", oportunidadeId)
      .order("created_at", { ascending: false }),
  ]);

  const actorIds = (activityRows ?? [])
    .map((r) => r.actor_app_user_id)
    .filter((id): id is string => Boolean(id));
  const actorById = await fetchActivityActors(supabase, actorIds);

  const leadCreatedAt = opp?.created_at ?? new Date(0).toISOString();
  const currentEtapa = (opp?.etapa as OpportunityStage | undefined) ?? null;

  const periods: LeadLifecyclePeriod[] = (periodRows ?? []).map((row) => {
    const enteredAt = String(row.entered_at);
    const exitedAt = row.exited_at ? String(row.exited_at) : null;
    const durationMs = durationMsBetween(enteredAt, exitedAt);
    return {
      id: String(row.id),
      etapa: row.etapa as OpportunityStage,
      etapaLabel: stageLabel(String(row.etapa)),
      enteredAt,
      exitedAt,
      durationMs,
      durationLabel: formatarDuracaoBr(durationMs),
      isCurrent: exitedAt == null,
      source: row.source ? String(row.source) : null,
    };
  });

  const activities: LeadActivityEvent[] = (activityRows ?? []).map((row) => {
    const etapa = row.etapa ? (String(row.etapa) as OpportunityStage) : null;
    const actorId = row.actor_app_user_id ? String(row.actor_app_user_id) : null;
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    return {
      id: String(row.id),
      kind: String(row.kind) as LeadActivityKind,
      title: String(row.title),
      detail: row.detail ? String(row.detail) : null,
      etapa,
      etapaLabel: etapa ? stageLabel(etapa) : null,
      areaKey: row.area_key ? String(row.area_key) : null,
      createdAt: String(row.created_at),
      actor: actorId ? actorById.get(actorId) ?? null : null,
      metadata: meta,
    };
  });

  const totalDurationMs = durationMsBetween(leadCreatedAt, null);
  const openPeriod = periods.find((p) => p.isCurrent) ?? null;

  return {
    periods,
    activities,
    summary: {
      leadCreatedAt,
      totalDurationMs,
      totalDurationLabel: formatarDuracaoBr(totalDurationMs),
      currentEtapa,
      currentEtapaDurationMs: openPeriod?.durationMs ?? null,
      currentEtapaDurationLabel: openPeriod?.durationLabel ?? "—",
      periodCount: periods.length,
      activityCount: activities.length,
    },
  };
}
