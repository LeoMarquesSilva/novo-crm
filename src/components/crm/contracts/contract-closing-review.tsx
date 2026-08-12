"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Revision = { id: string; numero: number; status: string; total_honorarios: number; total_tributos: number; total_reembolsos: number; total_geral: number };
type Item = { id: string; revisao_id: string; tipo: string; descricao: string; valor: number; bloqueante: boolean; bloqueio_descricao: string | null; resolvido_em: string | null };
type Detail = { closing: { competencia: string; revisao_atual_id: string | null }; revisions: Revision[]; items: Item[]; consumptions: Array<{ id: string; tipo: string; quantidade: number | null; valor: number | null }> };
export type ClosingPermissions = { canPrepare: boolean; canApprove: boolean; canRegisterVios: boolean };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function ContractClosingReview({ contractId, closingId, permissions }: { contractId: string; closingId: string; permissions: ClosingPermissions }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  const [vios, setVios] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/crm/contracts/${contractId}/closings/${closingId}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Falha ao carregar fechamento.");
    setError(null); setDetail(payload);
  }, [contractId, closingId]);
  useEffect(() => { void load(); }, [load]);
  async function act(body: object) {
    const response = await fetch(`/api/crm/contracts/${contractId}/closings/${closingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "A operação não foi concluída.");
    setError(null); await load();
  }
  if (!detail) return <p className="text-sm text-zinc-500">{error ?? "Carregando memória..."}</p>;
  const revision = detail.revisions.find((entry) => entry.id === detail.closing.revisao_atual_id) ?? detail.revisions[0];
  const items = detail.items.filter((entry) => entry.revisao_id === revision?.id);
  const blocked = items.some((entry) => entry.bloqueante && !entry.resolvido_em);
  const sections = [["Memória", ["memory", "charge", "tax", "reimbursement"]], ["Rateios", ["area_allocation"]], ["Participações", ["partner_share"]], ["Comissões", ["commission"]]] as const;
  return <div className="space-y-4 rounded-2xl border bg-white p-5">
    {error ? <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="flex justify-between"><strong>{detail.closing.competencia} · revisão {revision?.numero}</strong><span>{revision?.status}</span></div>
    <div className="grid gap-2 sm:grid-cols-4">{[["Honorários", revision?.total_honorarios], ["Tributos", revision?.total_tributos], ["Reembolsos", revision?.total_reembolsos], ["Total", revision?.total_geral]].map(([label, value]) => <div className="rounded bg-zinc-50 p-3" key={String(label)}><small>{label}</small><p className="font-bold">{money(Number(value ?? 0))}</p></div>)}</div>
    <section><h4 className="font-semibold">Entradas</h4><p className="text-sm">{detail.consumptions.map((entry) => `${entry.tipo}: ${entry.quantidade ?? money(entry.valor ?? 0)}`).join(" · ") || "Sem consumo"}</p></section>
    {items.filter((entry) => entry.bloqueante).map((entry) => <div key={entry.id} className="rounded border border-amber-300 bg-amber-50 p-3"><p>{entry.bloqueio_descricao}</p>{!entry.resolvido_em && permissions.canPrepare ? <div className="mt-2 flex gap-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa"/><Button onClick={() => act({ action: "resolve_blocker", itemId: entry.id, expectedRevision: revision.numero, resolution: "nao_cobrar", reason })}>Resolver</Button></div> : null}</div>)}
    {sections.map(([title, kinds]) => <section key={title}><h4 className="font-semibold">{title}</h4>{items.filter((entry) => kinds.includes(entry.tipo as never)).map((entry) => <div className="flex justify-between border-b py-2 text-sm" key={entry.id}><span>{entry.descricao}</span><strong>{money(entry.valor)}</strong></div>)}</section>)}
    <div className="flex flex-wrap gap-2 border-t pt-3">
      {revision?.status === "em_revisao" && permissions.canApprove ? <Button disabled={blocked} onClick={() => act({ action: "approve", expectedRevision: revision.numero })}>Aprovar</Button> : null}
      {revision && ["aprovado", "lancado_vios"].includes(revision.status) && permissions.canApprove ? <><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da nova revisão"/><Button variant="outline" onClick={() => act({ action: "new_revision", previousRevisionId: revision.id, expectedRevision: revision.numero, reason })}>Nova revisão</Button></> : null}
      {revision?.status === "aprovado" && permissions.canRegisterVios ? <><Input value={vios} onChange={(event) => setVios(event.target.value)} placeholder="Referência VIOS"/><Button onClick={() => act({ action: "register_vios", expectedRevision: revision.numero, reference: vios })}>Registrar VIOS</Button></> : null}
    </div>
  </div>;
}
