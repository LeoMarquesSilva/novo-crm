"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 300;

type PostgresChangeConfig = {
  table: string;
  filter?: string;
};

/**
 * Escuta alterações relevantes para a ficha do lead e dispara refresh debounced.
 * Cobre header, DUE, proposta, contrato, histórico e notas (via SSR + timeline).
 *
 * Pré-requisito: tabelas na publicação `supabase_realtime`
 * (migration `realtime_lead_detail`).
 */
export function useLeadDetailRealtime(
  oportunidadeId: string | null | undefined,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!oportunidadeId) return;

    const supabase = createSupabaseClient();
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!cancelled) onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    const oppFilter = `oportunidade_id=eq.${oportunidadeId}`;
    const idFilter = `id=eq.${oportunidadeId}`;

    const tables: PostgresChangeConfig[] = [
      { table: "oportunidades", filter: idFilter },
      { table: "lead_activity_events", filter: oppFilter },
      { table: "oportunidade_etapa_periodos", filter: oppFilter },
      { table: "transicoes_etapa", filter: oppFilter },
      { table: "due_area_tasks", filter: oppFilter },
      { table: "due_area_review_tasks", filter: oppFilter },
      { table: "contract_review_tasks", filter: oppFilter },
      { table: "proposta_escopo_solicitacao", filter: oppFilter },
      { table: "lead_notes", filter: oppFilter },
      { table: "field_values", filter: `entity_record_id=eq.${oportunidadeId}` },
      { table: "lead_intakes", filter: oppFilter },
    ];

    const topic = `lead-detail-${oportunidadeId}`;
    channel = supabase.channel(topic);

    for (const { table, filter } of tables) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        schedule,
      );
    }

    channel.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[lead-detail-realtime]", err?.message ?? err);
      }
    });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [oportunidadeId]);
}
