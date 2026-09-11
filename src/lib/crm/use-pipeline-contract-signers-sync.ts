"use client";

import { useEffect, useEffectEvent, useMemo } from "react";
import type { Oportunidade } from "@/modules/crm/domain/entities";

/** Só em dev/local — produção usa webhook D4Sign + Realtime Supabase (0 req API). */
const DEV_POLL_MS = 5 * 60_000;
const DEV_POLL_MS_AFTER_QUOTA = 30 * 60_000;

const syncGate = {
  lastStartedAt: 0,
  quotaUntil: 0,
  inFlight: false,
};

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
  const notifySynced = useEffectEvent(onSynced);

  const pollingEnabled = isKanbanSignersPollingEnabled();

  const pendingKey = useMemo(
    () =>
      pollingEnabled
        ? opportunities
            .filter((o) => o.etapa === "contrato_enviado" && o.d4signUpdatedAt)
            .map((o) => o.id)
            .join(",")
        : "",
    [opportunities, pollingEnabled],
  );

  useEffect(() => {
    if (!pollingEnabled || !pendingKey) return;
    const pendingIds = pendingKey.split(",").filter(Boolean);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const waitMs = () => {
      const now = Date.now();
      if (now < syncGate.quotaUntil) return syncGate.quotaUntil - now;
      if (syncGate.lastStartedAt === 0) return 0;
      return Math.max(0, DEV_POLL_MS - (now - syncGate.lastStartedAt));
    };

    const sync = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      if (syncGate.inFlight || waitMs() > 0) return;

      syncGate.inFlight = true;
      syncGate.lastStartedAt = Date.now();
      try {
        const response = await fetch("/api/crm/leads/sync-contract-signers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oportunidadeIds: pendingIds.slice(0, 1) }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          synced?: number;
        };

        if (response.status === 429) {
          syncGate.quotaUntil = Date.now() + DEV_POLL_MS_AFTER_QUOTA;
          return;
        }

        if (response.ok && payload.ok && (payload.synced ?? 0) > 0) {
          notifySynced();
        }
      } catch {
        // silencioso — próximo ciclo tenta de novo
      } finally {
        syncGate.inFlight = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void sync().finally(() => {
          if (!cancelled) schedule();
        });
      }, Math.max(waitMs(), DEV_POLL_MS));
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
  }, [pollingEnabled, pendingKey]);
}
