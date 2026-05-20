"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 200;

/**
 * Escuta alterações em `crm_in_app_notifications` do utilizador autenticado.
 * A tabela tem de estar na publicação `supabase_realtime` (ver migration).
 */
function newChannelTopicSuffix(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useCrmInAppNotificationsRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** Cada montagem do hook precisa de um canal com nome único (vários sinos + página usam o hook). */
  const topicSuffixRef = useRef<string>(newChannelTopicSuffix());

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

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const topic = `crm-in-app-notifications-${user.id}-${topicSuffixRef.current}`;
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "crm_in_app_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          schedule,
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR") {
            console.warn("[notifications] Realtime:", err?.message ?? err);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
}
