"use client";

import { useEffect, useRef } from "react";
import type { Oportunidade } from "@/modules/crm/domain/entities";

const POLL_MS = 45_000;

/**
 * Polling leve para leads em `contrato_enviado` quando webhook D4Sign não alcança
 * o ambiente (ex.: dev local). Atualiza signatários via GET /list (1 req/doc).
 */
export function usePipelineContractSignersSync(
  opportunities: Oportunidade[],
  onSynced: () => void,
) {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const pendingIds = opportunities
    .filter((o) => o.etapa === "contrato_enviado" && o.d4signUpdatedAt)
    .map((o) => o.id);

  const pendingKey = pendingIds.join(",");

  useEffect(() => {
    if (!pendingKey) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/crm/leads/sync-contract-signers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oportunidadeIds: pendingIds.slice(0, 3) }),
        });
        const payload = (await response.json()) as { ok?: boolean; synced?: number };
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
      }, POLL_MS);
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
  }, [pendingKey, pendingIds]);
}
