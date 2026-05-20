"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 300;

/**
 * Escuta alterações em `contract_review_tasks` para uma oportunidade específica.
 * Dispara `onChange` (debounced) sempre que o status / prazo / observação mudar.
 *
 * Pré-requisito: a tabela deve estar na publicação `supabase_realtime`
 * (migration 20260512110000_realtime_contract_review_tasks.sql).
 */
export function useContractReviewTaskRealtime(
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

    const topic = `contract-review-task-${oportunidadeId}`;
    channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contract_review_tasks",
          filter: `oportunidade_id=eq.${oportunidadeId}`,
        },
        schedule,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[review-task] Realtime:", err?.message ?? err);
        }
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [oportunidadeId]);
}
