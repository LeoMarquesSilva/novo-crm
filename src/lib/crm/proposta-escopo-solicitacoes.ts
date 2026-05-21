import type { SupabaseClient } from "@supabase/supabase-js";
import { appUserAreaCandidatesForScopeKey } from "@/lib/crm/area-keys-alignment";
import type { InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import { loadProposalCatalog } from "@/lib/crm/proposal-catalog-db";
import { getEscopoEntryForArea, isEscopoEntryCompleteWithCatalog } from "@/lib/crm/proposta-escopo-entry";
import { parseAreasList } from "@/lib/crm/proposta-escopo-json";
import type { PropostaEscopoDetalhe } from "@/data/proposta-tipos-catalog";
import { dispatchPropostaEscopoChannelNotifications } from "@/lib/crm/proposta-escopo-notify-channels";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";

const PRAZO_HORAS_DEFAULT = 72;

/** Resolve o gestor (`app_users.id`) cuja coluna `area` coincide com a chave de área. */
export async function findGestorAppUserIdForArea(
  supabase: SupabaseClient,
  areaKey: string,
): Promise<string | null> {
  const trimmed = areaKey.trim();
  if (!trimmed) return null;
  const candidates = appUserAreaCandidatesForScopeKey(trimmed);
  if (candidates.length === 0) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .in("area", candidates)
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export { getEscopoEntryForArea } from "@/lib/crm/proposta-escopo-entry";

/** Marca `concluido_em` quando o JSON de escopo satisfaz tipo/subtipo/placeholders para essa área. */
export async function refreshSolicitacaoConcluidaForEscopoJson(
  supabase: SupabaseClient,
  oportunidadeId: string,
  escopo: PropostaEscopoDetalhe,
  options?: { preenchidoPorAppUserId?: string | null },
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("proposta_escopo_solicitacao")
    .select("id, area_key, concluido_em, preenchido_por_app_user_id")
    .eq("oportunidade_id", oportunidadeId);
  if (error || !rows?.length) return;

  const now = new Date().toISOString();
  const catalog = await loadProposalCatalog(supabase);
  for (const row of rows) {
    const area = row.area_key;
    const entry = getEscopoEntryForArea(escopo, area);
    const done = isEscopoEntryCompleteWithCatalog(area, entry, catalog.scope, catalog.investment);
    if (done && !row.concluido_em) {
      await supabase
        .from("proposta_escopo_solicitacao")
        .update({
          concluido_em: now,
          preenchido_por_app_user_id: options?.preenchidoPorAppUserId ?? row.preenchido_por_app_user_id,
          updated_at: now,
        })
        .eq("id", row.id);
      const { data: oppRow } = await supabase
        .from("oportunidades")
        .select("etapa")
        .eq("id", oportunidadeId)
        .maybeSingle();
      await recordLeadActivityEvent(supabase, {
        oportunidadeId,
        kind: "proposta_escopo_concluido",
        title: `Escopo da proposta concluído — ${area}`,
        areaKey: area,
        etapa: (oppRow?.etapa as import("@/modules/crm/domain/entities").OpportunityStage | undefined) ?? null,
        actorAppUserId: options?.preenchidoPorAppUserId ?? row.preenchido_por_app_user_id ?? null,
        sourceId: `escopo-live:${row.id}:${now}`,
      });
    }
    if (done && row.concluido_em && options?.preenchidoPorAppUserId && !row.preenchido_por_app_user_id) {
      await supabase
        .from("proposta_escopo_solicitacao")
        .update({ preenchido_por_app_user_id: options.preenchidoPorAppUserId, updated_at: now })
        .eq("id", row.id);
    }
    if (!done && row.concluido_em) {
      await supabase
        .from("proposta_escopo_solicitacao")
        .update({ concluido_em: null, preenchido_por_app_user_id: null, updated_at: now })
        .eq("id", row.id);
      const { data: oppRow } = await supabase
        .from("oportunidades")
        .select("etapa")
        .eq("id", oportunidadeId)
        .maybeSingle();
      await recordLeadActivityEvent(supabase, {
        oportunidadeId,
        kind: "proposta_escopo_reaberto",
        title: `Escopo da proposta reaberto — ${area}`,
        areaKey: area,
        etapa: (oppRow?.etapa as import("@/modules/crm/domain/entities").OpportunityStage | undefined) ?? null,
        actorAppUserId: options?.preenchidoPorAppUserId ?? null,
        sourceId: `escopo-reopen:${row.id}:${now}`,
      });
    }
  }
}

/**
 * Sincroniza linhas de solicitação com as áreas atuais; remove órfãos; dispara notificações pendentes.
 */
export async function syncPropostaEscopoSolicitacoesForOportunidade(
  supabase: SupabaseClient,
  oportunidadeId: string,
  areasDisplay: string,
  options?: { originado_por?: InAppNotificationActor | null },
): Promise<void> {
  const { data: opRow } = await supabase
    .from("oportunidades")
    .select("etapa")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opRow?.etapa !== "confeccao_proposta") return;

  const areas = parseAreasList(areasDisplay);
  const prazo = new Date(Date.now() + PRAZO_HORAS_DEFAULT * 60 * 60 * 1000).toISOString();

  const { data: existing, error: exErr } = await supabase
    .from("proposta_escopo_solicitacao")
    .select("id, area_key")
    .eq("oportunidade_id", oportunidadeId);
  if (exErr) return;

  const areaSet = new Set(areas);
  for (const row of existing ?? []) {
    if (!areaSet.has(row.area_key)) {
      await supabase.from("proposta_escopo_solicitacao").delete().eq("id", row.id);
    }
  }

  for (const area of areas) {
    const gestorId = await findGestorAppUserIdForArea(supabase, area);
    const { error: upErr } = await supabase.from("proposta_escopo_solicitacao").upsert(
      {
        oportunidade_id: oportunidadeId,
        area_key: area,
        gestor_app_user_id: gestorId,
        prazo_ate: prazo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "oportunidade_id,area_key" },
    );
    if (upErr) {
      console.error("proposta_escopo_solicitacao upsert", upErr.message);
    }
  }

  await dispatchPropostaEscopoChannelNotifications(supabase, oportunidadeId, {
    originado_por: options?.originado_por ?? undefined,
  });
}
