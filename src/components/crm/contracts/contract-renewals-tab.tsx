"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";

type RenewalAlert = {
  id: string;
  contrato_id: string;
  data_base: string | null;
  data_vencimento: string | null;
  status: string;
  cliente_notificado_em: string | null;
  decisao: string | null;
  resolucao: string | null;
};

export function ContractRenewalsTab({ portfolio }: { portfolio: ContractPortfolioItem[] }) {
  const [alerts, setAlerts] = useState<RenewalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { decision: string; appliedIndex: string; notes: string }>>({});
  const contracts = useMemo(() => new Map(portfolio.map((item) => [item.id, item])), [portfolio]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const active = portfolio.filter((item) => item.lifecycle !== "encerrado" && item.lifecycle !== "suspenso");
      const results = await Promise.all(active.map(async (item) => {
        const response = await fetch(`/api/crm/contracts/${item.id}/renewals/open`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao carregar renovações.");
        return body.alerts as RenewalAlert[];
      }));
      setAlerts(results.flat().sort((a, b) => String(a.data_base).localeCompare(String(b.data_base))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar renovações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [portfolio]);

  async function save(alert: RenewalAlert, concluded: boolean) {
    const draft = drafts[alert.id] ?? { decision: alert.decisao ?? "", appliedIndex: "", notes: "" };
    setSavingId(alert.id);
    setError(null);
    try {
      const response = await fetch(`/api/crm/contracts/${alert.contrato_id}/renewals/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: draft.decision || null,
          appliedIndex: draft.appliedIndex || null,
          notes: draft.notes || null,
          conclusion: concluded ? draft.notes || draft.decision || "Renovação concluída." : null,
          concluded,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao atualizar renovação.");
      setAlerts((current) => current.map((item) => item.id === alert.id ? body.alert : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar renovação.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando renovações...</div>;

  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-zinc-900">Renovações e reajustes</h2><p className="text-sm text-zinc-500">Controle interno; nenhuma mensagem é enviada ao cliente.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-4" />Atualizar</Button>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
    {alerts.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">Nenhuma renovação pendente.</div> : null}
    <div className="grid gap-4">
      {alerts.map((alert) => {
        const contract = contracts.get(alert.contrato_id);
        const draft = drafts[alert.id] ?? { decision: alert.decisao ?? "", appliedIndex: "", notes: "" };
        const resolved = alert.status === "resolvido";
        return <article key={alert.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold text-zinc-900">{contract?.clientName ?? contract?.title ?? "Contrato"}</h3><p className="text-sm text-zinc-500">Data-base: {alert.data_base ? new Date(`${alert.data_base}T12:00:00`).toLocaleDateString("pt-BR") : "não definida"}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resolved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{resolved ? "Concluída" : "Pendente"}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Input aria-label="Decisão da renovação" placeholder="Decisão" value={draft.decision} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, decision: event.target.value } }))} />
            <Input aria-label="Índice aplicado" placeholder="Índice aplicado (ex.: IPCA 4,2%)" value={draft.appliedIndex} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, appliedIndex: event.target.value } }))} />
            <Input aria-label="Notas da renovação" placeholder="Notas internas" value={draft.notes} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, notes: event.target.value } }))} />
          </div>
          {!resolved ? <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={savingId === alert.id} onClick={() => void save(alert, false)}>Salvar</Button>
            <Button type="button" disabled={savingId === alert.id} onClick={() => void save(alert, true)}>{savingId === alert.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Concluir</Button>
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
