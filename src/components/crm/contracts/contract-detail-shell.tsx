"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { formatDateTimeBr, formatDateYmdBr } from "@/lib/format-datetime";
import type { ContractDetailViewModel } from "@/modules/contracts/infrastructure/contract-queries";

import { BILLING_KIND_LABELS, basisPointsToMaskedPercent, centsToMaskedBrl } from "./contract-setup-form-helpers";
import { ContractSetupWizard } from "./contract-setup-wizard";
import { ContractClosingsTab } from "./contract-closings-tab";
import { ContractVersionsPanel } from "./contract-versions-panel";

const date = (value: string | null) => formatDateYmdBr(value) || "—";

export function ContractDetailShell({
  contract,
  canConfigure,
}: {
  contract: ContractDetailViewModel;
  canConfigure: boolean;
}) {
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const tab = selectedTab ?? (searchParams.get("tab") === "closings" ? "closings" : "overview");
  const returnTarget = contract.opportunityId ? `/crm/leads/${contract.opportunityId}` : "/crm/contratos";
  const configuration = contract.configuration;

  const areaById = useMemo(
    () => new Map((configuration?.areas ?? []).map((area) => [area.id, area.areaKey])),
    [configuration?.areas],
  );

  return (
    <div className="space-y-5">
      <Link
        href="/crm/contratos"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-teal-700"
      >
        <ArrowLeft className="size-4" />
        Voltar para contratos
      </Link>

      <header className="rounded-2xl bg-zinc-950 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal-300">{contract.clientName}</p>
            <h1 className="mt-2 text-2xl font-bold">{contract.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Origem: {contract.originLabel}
              {contract.opportunityName ? ` · ${contract.opportunityName}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-white/10 text-white">{contract.lifecycle.replaceAll("_", " ")}</Badge>
            <Badge className="bg-teal-400/15 text-teal-200">
              {contract.signatureStatus.replaceAll("_", " ")}
            </Badge>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setSelectedTab} className="gap-4">
        <div className="overflow-x-auto">
          <TabsList variant="line" className="min-w-max justify-start">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="setup">Configuração</TabsTrigger>
            <TabsTrigger value="rules">Áreas e regras</TabsTrigger>
            <TabsTrigger value="allocations">Rateios</TabsTrigger>
            <TabsTrigger value="closings">Fechamentos</TabsTrigger>
            <TabsTrigger value="versions">Versões e aditivos</TabsTrigger>
            <TabsTrigger value="records">Documentos e eventos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Vigência"
              value={`${date(contract.startsAt)} — ${contract.indefinite ? "indeterminada" : date(contract.endsAt)}`}
            />
            <Metric
              label="Primeiro vencimento"
              value={contract.firstInvoiceConditioned ? "Condicionado" : date(contract.firstInvoiceAt)}
            />
            <Metric
              label="Renovação / reajuste"
              value={`${date(contract.renewalDate)} · ${contract.adjustmentIndex ?? "sem índice"}`}
            />
            <Metric
              label="Referência anual"
              value={centsToMaskedBrl(contract.annualReferenceCents) || "—"}
            />
          </div>
        </TabsContent>

        <TabsContent value="setup">
          <ContractSetupWizard contract={contract} canConfigure={canConfigure} returnTarget={returnTarget} />
        </TabsContent>

        <TabsContent value="closings">
          <ContractClosingsTab contractId={contract.id} />
        </TabsContent>

        <TabsContent value="rules">
          <Collection title="Áreas e franquias" empty="Nenhuma área configurada.">
            {configuration?.areas.map((area) => (
              <article key={area.id} className="rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                <AreaIconLabel area={area.areaKey} size="sm" />
                <p className="mt-2 text-sm text-slate-500">
                  {area.includedProcesses ?? 0} processos · {area.includedHours ?? 0} horas
                </p>
              </article>
            ))}
          </Collection>
          <Collection title="Componentes e regras" empty="Nenhum componente configurado.">
            {configuration?.version.components.map((component) => {
              const areaName = component.areaId ? areaById.get(component.areaId) : null;
              return (
                <article key={component.id} className="rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-[#102033]">{component.description}</h3>
                    <Badge variant="outline">
                      {BILLING_KIND_LABELS[component.kind] ?? component.kind}
                    </Badge>
                  </div>
                  {areaName ? (
                    <div className="mt-2">
                      <AreaIconLabel area={areaName} size="xs" />
                    </div>
                  ) : null}
                  <p className="mt-2 text-sm text-slate-500">
                    {component.kind === "exito_percentual"
                      ? basisPointsToMaskedPercent(component.percentageBasisPoints) || "—"
                      : centsToMaskedBrl(component.amountCents) || "—"}
                    {" · "}
                    {date(component.effectiveFrom)} a {date(component.effectiveTo)}
                  </p>
                </article>
              );
            })}
          </Collection>
        </TabsContent>

        <TabsContent value="allocations">
          <Collection title="Rateios por área" empty="Nenhum rateio configurado.">
            {configuration?.version.areaAllocations.map((allocation) => {
              const areaName = areaById.get(allocation.areaId) ?? "Área";
              return (
                <article
                  key={allocation.id}
                  className="rounded-xl border border-[#dfe5ee] bg-white p-4 text-sm shadow-sm"
                >
                  <AreaIconLabel area={areaName} size="sm" />
                  <p className="mt-2 font-mono tabular-nums text-slate-600">
                    {allocation.mode === "percentual"
                      ? basisPointsToMaskedPercent(allocation.percentageBasisPoints) || "—"
                      : centsToMaskedBrl(allocation.amountCents) || "—"}
                  </p>
                </article>
              );
            })}
          </Collection>
        </TabsContent>

        <TabsContent value="versions">
          <ContractVersionsPanel contract={contract} canManage={canConfigure} />
        </TabsContent>

        <TabsContent value="records">
          <div className="grid gap-4 lg:grid-cols-2">
            <Collection title="Documentos" empty="Nenhum documento vinculado.">
              {contract.documents.map((document) => (
                <article key={document.id} className="rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                  <strong className="text-[#102033]">{document.name}</strong>
                  <p className="mt-1 text-sm text-slate-500">{document.status ?? "Sem status"}</p>
                  {document.link ? (
                    <a
                      href={document.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-teal-700"
                    >
                      Abrir
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </article>
              ))}
            </Collection>
            <Collection title="Eventos" empty="Nenhum evento registrado.">
              {contract.events.map((event) => (
                <article key={event.id} className="rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                  <div className="flex justify-between gap-3">
                    <strong className="text-[#102033]">{event.title}</strong>
                    <span className="text-xs text-slate-400">
                      {formatDateTimeBr(event.createdAt)}
                    </span>
                  </div>
                  {event.detail ? <p className="mt-1 text-sm text-slate-500">{event.detail}</p> : null}
                </article>
              ))}
            </Collection>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe5ee] bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-[#102033]">{value}</p>
    </div>
  );
}

function Collection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const entries = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="mb-4 rounded-2xl border border-[#dfe5ee] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-[#102033]">{title}</h2>
      {entries.length ? (
        <div className="grid gap-3 md:grid-cols-2">{entries}</div>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}
