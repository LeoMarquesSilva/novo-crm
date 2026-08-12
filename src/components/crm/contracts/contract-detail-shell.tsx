"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContractDetailViewModel } from "@/modules/contracts/infrastructure/contract-queries";
import { ContractSetupWizard } from "./contract-setup-wizard";
import { ContractClosingsTab } from "./contract-closings-tab";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
const money = (cents: string | null) => cents ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100) : "—";

export function ContractDetailShell({ contract, canConfigure }: { contract: ContractDetailViewModel; canConfigure: boolean }) {
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "closings") setTab("closings");
  }, []);
  const returnTarget = contract.opportunityId ? `/crm/leads/${contract.opportunityId}` : "/crm/contratos";
  const configuration = contract.configuration;
  return <div className="space-y-5">
    <Link href="/crm/contratos" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-teal-700"><ArrowLeft className="size-4" />Voltar para contratos</Link>
    <header className="rounded-2xl bg-zinc-950 p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-teal-300">{contract.clientName}</p><h1 className="mt-2 text-2xl font-bold">{contract.title}</h1><p className="mt-2 text-sm text-zinc-400">Origem: {contract.originLabel}{contract.opportunityName ? ` · ${contract.opportunityName}` : ""}</p></div><div className="flex gap-2"><Badge className="bg-white/10 text-white">{contract.lifecycle.replaceAll("_", " ")}</Badge><Badge className="bg-teal-400/15 text-teal-200">{contract.signatureStatus.replaceAll("_", " ")}</Badge></div></div>
    </header>

    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="overflow-x-auto"><TabsList variant="line" className="min-w-max justify-start"><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="setup">Configuração</TabsTrigger><TabsTrigger value="rules">Áreas e regras</TabsTrigger><TabsTrigger value="allocations">Rateios</TabsTrigger><TabsTrigger value="closings">Fechamentos</TabsTrigger><TabsTrigger value="versions">Versões e aditivos</TabsTrigger><TabsTrigger value="records">Documentos e eventos</TabsTrigger></TabsList></div>
      <TabsContent value="overview"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Vigência" value={`${date(contract.startsAt)} — ${contract.indefinite ? "indeterminada" : date(contract.endsAt)}`} /><Metric label="Primeiro vencimento" value={contract.firstInvoiceConditioned ? "Condicionado" : date(contract.firstInvoiceAt)} /><Metric label="Renovação / reajuste" value={`${date(contract.renewalDate)} · ${contract.adjustmentIndex ?? "sem índice"}`} /><Metric label="Referência anual" value={money(contract.annualReferenceCents)} /></div></TabsContent>
      <TabsContent value="setup"><ContractSetupWizard contract={contract} canConfigure={canConfigure} returnTarget={returnTarget} /></TabsContent>
      <TabsContent value="closings"><ContractClosingsTab contractId={contract.id} /></TabsContent>
      <TabsContent value="rules"><Collection title="Áreas e franquias" empty="Nenhuma área configurada.">{configuration?.areas.map((area) => <article key={area.id} className="rounded-xl border border-zinc-200 p-4"><h3 className="font-semibold">{area.areaKey}</h3><p className="mt-1 text-sm text-zinc-500">{area.includedProcesses ?? 0} processos · {area.includedHours ?? 0} horas</p></article>)}</Collection><Collection title="Componentes e regras" empty="Nenhum componente configurado.">{configuration?.version.components.map((component) => <article key={component.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{component.description}</h3><Badge variant="outline">{component.kind.replaceAll("_", " ")}</Badge></div><p className="mt-2 text-sm text-zinc-500">{money(component.amountCents ?? null)} · {date(component.effectiveFrom)} a {date(component.effectiveTo)}</p></article>)}</Collection></TabsContent>
      <TabsContent value="allocations"><Collection title="Rateios por área" empty="Nenhum rateio configurado.">{configuration?.version.areaAllocations.map((allocation) => <article key={allocation.id} className="rounded-xl border border-zinc-200 p-4 text-sm"><strong>Área {allocation.areaId}</strong><p className="mt-1 text-zinc-500">{allocation.mode === "percentual" ? `${allocation.percentageBasisPoints / 100}%` : money(allocation.amountCents)}</p></article>)}</Collection></TabsContent>
      <TabsContent value="versions"><div className="grid gap-4 lg:grid-cols-2"><Collection title="Versões" empty="Nenhuma versão registrada.">{contract.versions.map((version) => <article key={version.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex justify-between gap-3"><strong>Versão {version.number}</strong><Badge variant="outline">{version.status}</Badge></div><p className="mt-1 text-sm text-zinc-500">{date(version.startsAt)} — {date(version.endsAt)}</p></article>)}</Collection><Collection title="Aditivos" empty="Nenhum aditivo registrado.">{contract.addenda.map((addendum) => <article key={addendum.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex justify-between gap-3"><strong>{addendum.title}</strong><Badge variant="outline">{addendum.status}</Badge></div>{addendum.link ? <a href={addendum.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-teal-700">Abrir documento<ExternalLink className="size-3" /></a> : null}</article>)}</Collection></div></TabsContent>
      <TabsContent value="records"><div className="grid gap-4 lg:grid-cols-2"><Collection title="Documentos" empty="Nenhum documento vinculado.">{contract.documents.map((document) => <article key={document.id} className="rounded-xl border border-zinc-200 p-4"><strong>{document.name}</strong><p className="mt-1 text-sm text-zinc-500">{document.status ?? "Sem status"}</p>{document.link ? <a href={document.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-teal-700">Abrir<ExternalLink className="size-3" /></a> : null}</article>)}</Collection><Collection title="Eventos" empty="Nenhum evento registrado.">{contract.events.map((event) => <article key={event.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex justify-between gap-3"><strong>{event.title}</strong><span className="text-xs text-zinc-400">{new Intl.DateTimeFormat("pt-BR").format(new Date(event.createdAt))}</span></div>{event.detail ? <p className="mt-1 text-sm text-zinc-500">{event.detail}</p> : null}</article>)}</Collection></div></TabsContent>
    </Tabs>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 font-semibold text-zinc-900">{value}</p></div>;
}

function Collection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const entries = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-bold">{title}</h2>{entries.length ? <div className="grid gap-3 md:grid-cols-2">{entries}</div> : <p className="text-sm text-zinc-500">{empty}</p>}</section>;
}
