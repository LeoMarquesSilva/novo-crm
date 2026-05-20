"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 400;

/**
 * Escuta alterações em `d4sign_documents` (qualquer linha).
 * Usado no dashboard de contratos para refletir assinaturas em tempo real
 * quando o webhook D4Sign atualiza `signers` / `d4sign_status`.
 *
 * Pré-requisito: tabela na publicação `supabase_realtime`
 * (migration realtime_d4sign_documents).
 */
export function useD4SignDocumentsRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
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

    channel = supabase
      .channel("d4sign-documents-any")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "d4sign_documents" },
        schedule,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[d4sign-realtime]", err?.message ?? err);
        }
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
}

/**
 * Escuta alterações em `oportunidades` para um lead específico.
 * Usado no builder de contrato para detectar atualização de `d4sign_signers`
 * pelo webhook (alguém assinou → reflete na lista de signatários).
 */
export function useOportunidadeRealtime(
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

    channel = supabase
      .channel(`oportunidade-signers-${oportunidadeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "oportunidades",
          filter: `id=eq.${oportunidadeId}`,
        },
        schedule,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[oportunidade-realtime]", err?.message ?? err);
        }
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [oportunidadeId]);
}
