"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type SyncOk = {
  ok: true;
  groups: number;
  clients: number;
  titlesLinked: number;
  syncedAt: string;
};

export function CarteiraSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/crm/carteira", { method: "POST" });
      const json = (await res.json()) as SyncOk | { ok?: false; error?: string };
      if (!res.ok || json.ok !== true) {
        throw new Error(("error" in json && json.error) || "Falha ao sincronizar a carteira.");
      }
      setMessage(
        `${json.groups} grupos · ${json.clients} pessoas/CNPJs · ${json.titlesLinked} grupos com título SIOE`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao sincronizar a carteira.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {busy ? "Sincronizando…" : "Sincronizar OrquestrAI"}
      </Button>
      {message ? <p className="text-xs font-medium text-foreground">{message}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
