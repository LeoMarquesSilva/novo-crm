"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";

type HealthData = {
  quota: { used: number; limit: number; remaining: number; lastSyncedAt: string | null };
  documents: {
    total: number;
    from_crm: number;
    from_vault: number;
    without_signers: number;
    missing_names: number;
    stale_pending: number;
  };
  webhook: { last_at: string | null; last_type: string | null };
  usage_24h: { total: number; by_source: Record<string, number> };
};

function fmtRel(iso: string | null): string {
  if (!iso) return "nunca";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `há ${mins} min`;
  return `há ${Math.floor(mins / 60)}h`;
}

export function D4SignHealthPanel({ className }: { className?: string }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/crm/d4sign/health")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j as HealthData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" /> Carregando saúde D4Sign…
      </div>
    );
  }

  if (!data) return null;

  const webhookStale =
    !data.webhook.last_at ||
    Date.now() - new Date(data.webhook.last_at).getTime() > 7 * 24 * 60 * 60 * 1000;

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4 text-accent-teal" />
        <h3 className="text-sm font-bold text-slate-800">Saúde D4Sign</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="No cofre" value={data.documents.total} detail={`${data.documents.from_vault} histórico · ${data.documents.from_crm} CRM`} />
        <Stat label="Sem signatários" value={data.documents.without_signers} warn={data.documents.without_signers > 0} />
        <Stat label="Pendentes desatualizados" value={data.documents.stale_pending} warn={data.documents.stale_pending > 0} />
        <Stat label="Reqs (24h)" value={data.usage_24h.total} detail={Object.entries(data.usage_24h.by_source).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Webhook className="size-3" />
          Webhook: {fmtRel(data.webhook.last_at)}
          {data.webhook.last_type ? ` (${data.webhook.last_type})` : ""}
          {webhookStale ? <span className="font-semibold text-amber-600"> · verificar config</span> : null}
        </span>
        <span>Última sync: {fmtRel(data.quota.lastSyncedAt)}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  warn,
}: {
  label: string;
  value: number;
  detail?: string;
  warn?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", warn ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50/50")}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-xl font-black tabular-nums", warn ? "text-amber-700" : "text-slate-800")}>{value}</p>
      {detail ? <p className="text-[10px] text-slate-500">{detail}</p> : null}
    </div>
  );
}
