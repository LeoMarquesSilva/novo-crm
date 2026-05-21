import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type LeadActivityKind =
  | "lead_criado"
  | "etapa_alterada"
  | "campo_pipeline_alterado"
  | "campo_intake_alterado"
  | "campo_rd_alterado"
  | "proposta_escopo_concluido"
  | "proposta_escopo_reaberto"
  | "nota_adicionada"
  | "due_dados_disponibilizados"
  | "due_revisao_aprovada"
  | "due_ajustes_solicitados"
  | "due_ajustes_concluidos"
  | "contrato_enviado"
  | "contrato_assinado"
  | "proposta_escopo_solicitado";

export async function recordLeadActivityEvent(
  supabase: SupabaseClient,
  input: {
    oportunidadeId: string;
    kind: LeadActivityKind;
    title: string;
    detail?: string | null;
    metadata?: Record<string, unknown>;
    etapa?: OpportunityStage | null;
    areaKey?: string | null;
    actorAppUserId?: string | null;
    sourceId?: string | null;
    createdAt?: string;
  },
): Promise<void> {
  const row = {
    oportunidade_id: input.oportunidadeId,
    kind: input.kind,
    title: input.title,
    detail: input.detail?.trim() || null,
    metadata: (input.metadata ?? {}) as never,
    etapa: input.etapa ?? null,
    area_key: input.areaKey?.trim() || null,
    actor_app_user_id: input.actorAppUserId ?? null,
    source_id: input.sourceId?.trim() || null,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  };

  const { error } = await supabase.from("lead_activity_events").insert(row as never);
  if (error && (error as { code?: string }).code !== "23505") {
    console.warn("[lead_activity_events]", error.message);
  }
}
