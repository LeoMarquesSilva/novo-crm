"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Revision = { id: string; numero: number; status: string; total_honorarios: number; total_tributos: number; total_reembolsos: number; total_geral: number };
type Item = { id: string; revisao_id: string; tipo: string; descricao: string; valor: number; bloqueante: boolean; bloqueio_descricao: string | null; resolvido_em: string | null };
type Consumption = { id?: string; componente_id: string | null; area_id: string | null; tipo: "processo" | "hora" | "quilometro" | "valor_manual"; quantidade: number | null; valor: number | null };
type Resolution = { componente_id: string; liberado: boolean; valor: number | null; base_calculo: number | null; motivo: string | null };
type Component = { id: string; descricao: string; tipo: string; area_id: string | null; liberacao_manual_necessaria: boolean };
type Detail = { closing: { competencia: string; revisao_atual_id: string | null; versao_id: string }; revisions: Revision[]; items: Item[]; consumptions: Consumption[]; resolutions: Resolution[]; components: Component[]; areas: Array<{ id: string; area_key: string }> };
export type ClosingPermissions = { canPrepare: boolean; canApprove: boolean; canRegisterVios: boolean };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const decimal = (value: number | null) => value === null ? "" : String(value);

export function ContractClosingReview({ contractId, closingId, permissions }: { contractId: string; closingId: string; permissions: ClosingPermissions }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [reason, setReason] = useState(""); const [vios, setVios] = useState(""); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/crm/contracts/${contractId}/closings/${closingId}`, { cache: "no-store" }); const payload = await response.json();
    if (!response.ok) return setError(payload.error ?? "Falha ao carregar fechamento.");
    setError(null); setDetail(payload); setConsumptions(payload.consumptions); setResolutions(payload.resolutions);
  }, [contractId, closingId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function request(url: string, method: string, body: object) { const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) { setError(payload.error ?? "A operação não foi concluída."); return false; } setError(null); return true; }
  async function act(body: object) { if (await request(`/api/crm/contracts/${contractId}/closings/${closingId}`, "PATCH", body)) await load(); }
  if (!detail) return <p className="text-sm text-zinc-500">{error ?? "Carregando memória..."}</p>;
  const currentDetail = detail;
  const revision = currentDetail.revisions.find((entry) => entry.id === currentDetail.closing.revisao_atual_id) ?? currentDetail.revisions[0]; const items = currentDetail.items.filter((entry) => entry.revisao_id === revision?.id); const blocked = items.some((entry) => entry.bloqueante && !entry.resolvido_em); const editable = permissions.canPrepare && revision?.status === "em_revisao";
  async function saveInputs() {
    const ok = await request(`/api/crm/contracts/${contractId}/consumptions`, "PUT", {
      competency: currentDetail.closing.competencia, versionId: currentDetail.closing.versao_id,
      items: consumptions.map((entry) => ({ id: entry.id, componentId: entry.componente_id, areaId: entry.area_id, kind: entry.tipo, quantity: entry.tipo === "valor_manual" ? null : entry.quantidade, amount: entry.tipo === "valor_manual" ? entry.valor : null })),
      resolutions: resolutions.map((entry) => ({ componentId: entry.componente_id, released: entry.liberado, amount: decimal(entry.valor) || null, base: decimal(entry.base_calculo) || null, reason: entry.motivo })),
    });
    if (!ok) return;
    const recalculated = await request(`/api/crm/contracts/${contractId}/closings`, "POST", { competency: currentDetail.closing.competencia, expectedRevision: revision.numero });
    if (recalculated) await load();
  }
  const manualComponents = detail.components.filter((component) => component.liberacao_manual_necessaria);
  return <div className="space-y-4 rounded-2xl border bg-white p-5">
    {error ? <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="flex justify-between"><strong>{detail.closing.competencia} · revisão {revision?.numero}</strong><span>{revision?.status}</span></div>
    <div className="grid gap-2 sm:grid-cols-4">{[["Honorários", revision?.total_honorarios], ["Tributos", revision?.total_tributos], ["Reembolsos", revision?.total_reembolsos], ["Total", revision?.total_geral]].map(([label, value]) => <div className="rounded bg-zinc-50 p-3" key={String(label)}><small>{label}</small><p className="font-bold">{money(Number(value ?? 0))}</p></div>)}</div>
    <section className="space-y-2"><div className="flex justify-between"><h4 className="font-semibold">Consumos mensais</h4>{editable ? <Button size="sm" variant="outline" onClick={() => setConsumptions([...consumptions, { componente_id: detail.components[0]?.id ?? null, area_id: detail.areas[0]?.id ?? null, tipo: "hora", quantidade: 0, valor: null }])}>Adicionar</Button> : null}</div>{consumptions.map((entry, index) => <div className="grid gap-2 rounded border p-2 md:grid-cols-4" key={entry.id ?? index}><select disabled={!editable} className="rounded border p-2 text-sm" value={entry.tipo} onChange={(event) => setConsumptions(consumptions.map((item, itemIndex) => itemIndex === index ? { ...item, tipo: event.target.value as Consumption["tipo"], quantidade: event.target.value === "valor_manual" ? null : 0, valor: event.target.value === "valor_manual" ? 0 : null } : item))}><option value="processo">Processos</option><option value="hora">Horas</option><option value="quilometro">KM</option><option value="valor_manual">Valor manual</option></select><select disabled={!editable} className="rounded border p-2 text-sm" value={entry.componente_id ?? ""} onChange={(event) => setConsumptions(consumptions.map((item, itemIndex) => itemIndex === index ? { ...item, componente_id: event.target.value || null } : item))}>{detail.components.map((component) => <option key={component.id} value={component.id}>{component.descricao}</option>)}</select><select disabled={!editable} className="rounded border p-2 text-sm" value={entry.area_id ?? ""} onChange={(event) => setConsumptions(consumptions.map((item, itemIndex) => itemIndex === index ? { ...item, area_id: event.target.value || null } : item))}><option value="">Sem área</option>{detail.areas.map((area) => <option key={area.id} value={area.id}>{area.area_key}</option>)}</select><Input disabled={!editable} type="number" min="0" step={entry.tipo === "valor_manual" ? "0.01" : "1"} value={entry.tipo === "valor_manual" ? decimal(entry.valor) : decimal(entry.quantidade)} onChange={(event) => setConsumptions(consumptions.map((item, itemIndex) => itemIndex === index ? { ...item, ...(entry.tipo === "valor_manual" ? { valor: Number(event.target.value) } : { quantidade: Number(event.target.value) }) } : item))}/></div>)}</section>
    {manualComponents.length ? <section className="space-y-2"><h4 className="font-semibold">Liberações desta competência</h4>{manualComponents.map((component) => { const current = resolutions.find((entry) => entry.componente_id === component.id) ?? { componente_id: component.id, liberado: false, valor: null, base_calculo: null, motivo: null }; const update = (patch: Partial<Resolution>) => setResolutions([...resolutions.filter((entry) => entry.componente_id !== component.id), { ...current, ...patch }]); return <div key={component.id} className="grid gap-2 rounded border p-3 md:grid-cols-4"><label className="flex items-center gap-2 text-sm"><input disabled={!editable} type="checkbox" checked={current.liberado} onChange={(event) => update({ liberado: event.target.checked })}/>{component.descricao}</label><Input disabled={!editable} type="number" step="0.01" placeholder="Valor" value={decimal(current.valor)} onChange={(event) => update({ valor: event.target.value ? Number(event.target.value) : null })}/><Input disabled={!editable} type="number" step="0.01" placeholder="Base" value={decimal(current.base_calculo)} onChange={(event) => update({ base_calculo: event.target.value ? Number(event.target.value) : null })}/><Input disabled={!editable} placeholder="Motivo" value={current.motivo ?? ""} onChange={(event) => update({ motivo: event.target.value || null })}/></div>; })}</section> : null}
    {editable ? <Button onClick={saveInputs}>Salvar entradas e recalcular</Button> : null}
    {items.filter((entry) => entry.bloqueante).map((entry) => <div key={entry.id} className="rounded border border-amber-300 bg-amber-50 p-3"><p>{entry.bloqueio_descricao}</p>{!entry.resolvido_em && editable ? <div className="mt-2 flex gap-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa"/><Button onClick={() => act({ action: "resolve_blocker", itemId: entry.id, expectedRevision: revision.numero, resolution: "nao_cobrar", reason })}>Não cobrar</Button></div> : null}</div>)}
    {[["Memória", ["memory", "charge", "tax", "reimbursement"]], ["Rateios", ["area_allocation"]], ["Participações", ["partner_share"]], ["Comissões", ["commission"]]].map(([title, kinds]) => <section key={String(title)}><h4 className="font-semibold">{title as string}</h4>{items.filter((entry) => (kinds as string[]).includes(entry.tipo)).map((entry) => <div className="flex justify-between border-b py-2 text-sm" key={entry.id}><span>{entry.descricao}</span><strong>{money(entry.valor)}</strong></div>)}</section>)}
    <div className="flex flex-wrap gap-2 border-t pt-3">{revision?.status === "em_revisao" && permissions.canApprove ? <Button disabled={blocked} onClick={() => act({ action: "approve", expectedRevision: revision.numero })}>Aprovar</Button> : null}{revision && ["aprovado", "lancado_vios"].includes(revision.status) && permissions.canApprove ? <><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da nova revisão"/><Button variant="outline" onClick={() => act({ action: "new_revision", previousRevisionId: revision.id, expectedRevision: revision.numero, reason })}>Nova revisão</Button></> : null}{revision?.status === "aprovado" && permissions.canRegisterVios ? <><Input value={vios} onChange={(event) => setVios(event.target.value)} placeholder="Referência VIOS"/><Button onClick={() => act({ action: "register_vios", expectedRevision: revision.numero, reference: vios })}>Registrar VIOS</Button></> : null}</div>
  </div>;
}
