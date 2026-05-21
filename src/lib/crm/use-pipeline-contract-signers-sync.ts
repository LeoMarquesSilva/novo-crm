"use client";

import { useEffect, useRef } from "react";
import type { Oportunidade } from "@/modules/crm/domain/entities";

/** Só em dev/local — produção usa webhook D4Sign + Realtime Supabase (0 req API). */
const DEV_POLL_MS = 5 * 60_000;
const DEV_POLL_MS_AFTER_QUOTA = 30 * 60_000;

/**
 * Polling opcional apenas para desenvolvimento (webhook não alcança localhost).
 * Em produção fica desligado: assinaturas chegam via POSTBack D4Sign → oportunidades → Realtime.
 */
export function isKanbanSignersPollingEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_D4SIGN_KANBAN_POLLING?.trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return process.env.NODE_ENV === "development";
}

export function usePipelineContractSignersSync(
  opportunities: Oportunidade[],
  onSynced: () => void,
) {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const pollingEnabled = isKanbanSignersPollingEnabled();

  const pendingIds = pollingEnabled
    ? opportunities
        .filter((o) => o.etapa === "contrato_enviado" && o.d4signUpdatedAt)
        .map((o) => o.id)
    : [];

  const pendingKey = pendingIds.join(",");

  useEffect(() => {
    if (!pollingEnabled || !pendingKey) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextDelayMs = DEV_POLL_MS;

    const sync = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/crm/leads/sync-contract-signers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oportunidadeIds: pendingIds.slice(0, 1) }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          synced?: number;
          quota?: { resetAt?: string | null };
        };

        if (response.status === 429) {
          nextDelayMs = DEV_POLL_MS_AFTER_QUOTA;
          return;
        }

        nextDelayMs = DEV_POLL_MS;
        if (response.ok && payload.ok && (payload.synced ?? 0) > 0) {
          onSyncedRef.current();
        }
      } catch {
        // silencioso — próximo ciclo tenta de novo
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void sync().finally(() => {
          if (!cancelled) schedule();
        });
      }, nextDelayMs);
    };

    void sync();
    schedule();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollingEnabled, pendingKey, pendingIds]);
}
