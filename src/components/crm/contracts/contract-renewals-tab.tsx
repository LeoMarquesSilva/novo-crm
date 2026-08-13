"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { formatDateYmdBr } from "@/lib/format-datetime";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";

type RenewalAlert = {
  id: string;
  contrato_id: string;
  data_base: string | null;
  status: string;
  responsavel_app_user_id: string | null;
  cliente_notificado_em: string | null;
  cliente_notificado_por: string | null;
  decisao: string | null;
  resolucao: string | null;
};
type RenewalUser = { id: string; full_name: string };
type RenewalDraft = { assigneeId: string; customerNotifiedAt: string; decision: string; appliedIndex: string; notes: string; conclusion: string };

function draftFromAlert(alert: RenewalAlert): RenewalDraft {
  let resolution: Record<string, unknown> = {};
  try { resolution = alert.resolucao ? JSON.parse(alert.resolucao) as Record<string, unknown> : {}; } catch { resolution = {}; }
  return {
    assigneeId: alert.responsavel_app_user_id ?? "",
    customerNotifiedAt: alert.cliente_notificado_em?.slice(0, 16) ?? "",
    decision: alert.decisao ?? "",
    appliedIndex: typeof resolution.appliedIndex === "string" ? resolution.appliedIndex : "",
    notes: typeof resolution.notes === "string" ? resolution.notes : "",
    conclusion: typeof resolution.conclusion === "string" ? resolution.conclusion : "",
  };
}

export function ContractRenewalsTab({ portfolio }: { portfolio: ContractPortfolioItem[] }) {
  const [alerts, setAlerts] = useState<RenewalAlert[]>([]);
  const [users, setUsers] = useState<RenewalUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RenewalDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contracts = useMemo(() => new Map(portfolio.map((item) => [item.id, item])), [portfolio]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const active = portfolio.filter((item) => item.lifecycle !== "encerrado" && item.lifecycle !== "suspenso");
      const results = await Promise.all(active.map(async (item) => {
        const response = await fetch(`/api/crm/contracts/${item.id}/renewals/open`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao carregar renovações.");
        return { alerts: body.alerts as RenewalAlert[], users: body.users as RenewalUser[] };
      }));
      const loaded = results.flatMap((result) => result.alerts).sort((a, b) => String(a.data_base).localeCompare(String(b.data_base)));
      setAlerts(loaded);
      setUsers(results[0]?.users ?? []);
      setDrafts(Object.fromEntries(loaded.map((alert) => [alert.id, draftFromAlert(alert)])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar renovações."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [portfolio]);

  async function save(alert: RenewalAlert, concluded: boolean) {
    const draft = drafts[alert.id] ?? draftFromAlert(alert);
    setSavingId(alert.id); setError(null);
    try {
      const response = await fetch(`/api/crm/contracts/${alert.contrato_id}/renewals/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: draft.assigneeId || null,
          customerNotifiedAt: draft.customerNotifiedAt ? new Date(draft.customerNotifiedAt).toISOString() : null,
          decision: draft.decision || null,
          appliedIndex: draft.appliedIndex || null,
          notes: draft.notes || null,
          conclusion: draft.conclusion || null,
          concluded,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao atualizar renovação.");
      setAlerts((current) => current.map((item) => item.id === alert.id ? body.alert : item));
      setDrafts((current) => ({ ...current, [alert.id]: draftFromAlert(body.alert) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar renovação."); }
    finally { setSavingId(null); }
  }

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando renovações...</div>;
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-zinc-900">Renovações e reajustes</h2><p className="text-sm text-zinc-500">Controle interno; nenhuma mensagem é enviada ao cliente.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-4" />Atualizar</Button></div>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
    {alerts.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">Nenhuma renovação pendente.</div> : null}
    <div className="grid gap-4">{alerts.map((alert) => {
      const contract = contracts.get(alert.contrato_id);
      const draft = drafts[alert.id] ?? draftFromAlert(alert);
      const resolved = alert.status === "resolvido";
      const notifiedBy = users.find((user) => user.id === alert.cliente_notificado_por)?.full_name;
      return <article key={alert.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-zinc-900">{contract?.clientName ?? contract?.title ?? "Contrato"}</h3><p className="text-sm text-zinc-500">Data-base: {alert.data_base ? formatDateYmdBr(alert.data_base) || "não definida" : "não definida"}{notifiedBy ? ` · Cliente notificado por ${notifiedBy}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resolved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{resolved ? "Concluída" : "Pendente"}</span></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select
            items={Object.fromEntries(users.map((user) => [user.id, user.full_name]))}
            value={draft.assigneeId || "__none__"}
            disabled={resolved}
            onValueChange={(next) =>
              setDrafts((all) => ({
                ...all,
                [alert.id]: {
                  ...draft,
                  assigneeId: !next || next === "__none__" ? "" : next,
                },
              }))
            }
          >
            <SelectTrigger
              aria-label="Responsável pela renovação"
              className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm"
            >
              {draft.assigneeId ? (
                <CrmUserLabel
                  name={users.find((user) => user.id === draft.assigneeId)?.full_name ?? "Responsável"}
                  size="xs"
                  variant="inline"
                />
              ) : (
                <span className="text-slate-400">Sem responsável</span>
              )}
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value="__none__">Sem responsável</CrmSelectItem>
              {users.map((user) => (
                <CrmSelectItem key={user.id} value={user.id}>
                  <CrmUserLabel name={user.full_name} size="xs" variant="inline" />
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <DateInputBr
              aria-describedby={undefined}
              value={draft.customerNotifiedAt.slice(0, 10)}
              disabled={resolved}
              className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
              onChange={(ymd) => {
                const time = draft.customerNotifiedAt.includes("T")
                  ? draft.customerNotifiedAt.slice(11, 16) || "09:00"
                  : "09:00";
                setDrafts((all) => ({
                  ...all,
                  [alert.id]: {
                    ...draft,
                    customerNotifiedAt: ymd ? `${ymd}T${time}` : "",
                  },
                }));
              }}
            />
            <TimeInputBr
              value={
                draft.customerNotifiedAt.includes("T")
                  ? draft.customerNotifiedAt.slice(11, 16)
                  : ""
              }
              disabled={resolved || !draft.customerNotifiedAt.slice(0, 10)}
              className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
              onChange={(hm) => {
                const day = draft.customerNotifiedAt.slice(0, 10);
                if (!day) return;
                setDrafts((all) => ({
                  ...all,
                  [alert.id]: {
                    ...draft,
                    customerNotifiedAt: `${day}T${hm || "09:00"}`,
                  },
                }));
              }}
            />
          </div>
          <Input aria-label="Decisão da renovação" placeholder="Decisão" value={draft.decision} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, decision: event.target.value } }))} />
          <Input aria-label="Índice aplicado" placeholder="Índice aplicado (ex.: IPCA 4,2%)" value={draft.appliedIndex} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, appliedIndex: event.target.value } }))} />
          <Input aria-label="Notas da renovação" placeholder="Notas internas" value={draft.notes} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, notes: event.target.value } }))} />
          <Input aria-label="Conclusão da renovação" placeholder="Conclusão explícita" value={draft.conclusion} disabled={resolved} onChange={(event) => setDrafts((all) => ({ ...all, [alert.id]: { ...draft, conclusion: event.target.value } }))} />
        </div>
        {!resolved ? <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={savingId === alert.id} onClick={() => void save(alert, false)}>Salvar</Button><Button type="button" disabled={savingId === alert.id || !draft.conclusion.trim()} onClick={() => void save(alert, true)}>{savingId === alert.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Concluir</Button></div> : null}
      </article>;
    })}</div>
  </section>;
}
