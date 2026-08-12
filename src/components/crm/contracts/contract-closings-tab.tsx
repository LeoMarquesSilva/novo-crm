"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";
import { expectedRevisionForPreparation } from "@/modules/contracts/application/services/prepare-monthly-closing";
import { ContractClosingReview, type ClosingPermissions } from "./contract-closing-review";

type Closing = { id: string; competencia: string; status: string; revisao_atual_id: string | null; currentRevision: number };
const denied: ClosingPermissions = { canPrepare: false, canApprove: false, canRegisterVios: false };

export function ContractClosingsTab({ contractId, portfolio = [], permissions = denied }: { contractId?: string; portfolio?: ContractPortfolioItem[]; permissions?: ClosingPermissions }) {
  const [list, setList] = useState<Closing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [competency, setCompetency] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [error, setError] = useState<string | null>(null);
  const [serverPermissions, setServerPermissions] = useState<ClosingPermissions>(permissions);
  const load = useCallback(async () => {
    if (!contractId) return;
    const response = await fetch(`/api/crm/contracts/${contractId}/closings`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Falha ao listar fechamentos.");
    setError(null); setServerPermissions(payload.permissions ?? denied); setList(payload.closings); setSelected((current) => current ?? payload.closings[0]?.id ?? null);
  }, [contractId]);
  useEffect(() => { void load(); }, [load]);
  if (!contractId) return <div className="space-y-2">{portfolio.filter((item) => item.lifecycle === "ativo" || item.closingCount).map((item) => <Link className="flex justify-between rounded-xl border bg-white p-4" href={`/crm/contratos/${item.id}?tab=closings`} key={item.id}><strong>{item.clientName}</strong><span>{item.pendingClosingCount} pendente(s)</span></Link>)}</div>;
  async function prepare() {
    const current = list.find((entry) => entry.competencia === competency) ?? null;
    const response = await fetch(`/api/crm/contracts/${contractId}/closings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competency, expectedRevision: expectedRevisionForPreparation(current) }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Falha ao preparar fechamento.");
    setError(null); await load();
  }
  return <div className="space-y-4">
    {error ? <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    {serverPermissions.canPrepare ? <div className="flex gap-2"><Input type="date" value={competency} onChange={(event) => setCompetency(event.target.value.slice(0, 7) + "-01")}/><Button onClick={prepare}>Preparar / recalcular</Button></div> : null}
    <div className="flex flex-wrap gap-2">{list.map((entry) => <Button size="sm" variant={selected === entry.id ? "default" : "outline"} onClick={() => setSelected(entry.id)} key={entry.id}>{entry.competencia} · revisão {entry.currentRevision} · {entry.status}</Button>)}</div>
    {selected ? <ContractClosingReview contractId={contractId} closingId={selected} permissions={serverPermissions}/> : <p className="text-sm text-zinc-500">Nenhum fechamento.</p>}
  </div>;
}
