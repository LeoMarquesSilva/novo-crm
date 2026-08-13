"use client";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, CalendarClock, Search } from "lucide-react";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger } from "@/components/ui/select";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { formatDateYmdBr } from "@/lib/format-datetime";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";
import { BILLING_KIND_LABELS, centsToMaskedBrl } from "./contract-setup-form-helpers";

const lifecycleLabels: Record<ContractPortfolioItem["lifecycle"], string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
};

function money(cents: string | null): string {
  return centsToMaskedBrl(cents) || "—";
}

function date(value: string | null): string {
  return formatDateYmdBr(value) || "—";
}

type Filters = {
  search: string;
  manager: string;
  area: string;
  tag: string;
  origin: string;
  lifecycle: string;
  billingKind: string;
  renewal: string;
};

export function filterPortfolio(items: ContractPortfolioItem[], filters: Filters): ContractPortfolioItem[] {
  const query = filters.search.trim().toLocaleLowerCase("pt-BR");
  const now = new Date();
  return items.filter((item) => {
    const searchable = `${item.title} ${item.clientName}`.toLocaleLowerCase("pt-BR");
    const renewal = item.renewalDate ? new Date(`${item.renewalDate}T12:00:00`) : null;
    const renewalDays = renewal ? Math.ceil((renewal.getTime() - now.getTime()) / 86_400_000) : null;
    return (!query || searchable.includes(query))
      && (!filters.manager || item.managerId === filters.manager)
      && (!filters.area || item.areas.includes(filters.area))
      && (!filters.tag || item.tags.includes(filters.tag))
      && (!filters.origin || item.origin === filters.origin)
      && (!filters.lifecycle || item.lifecycle === filters.lifecycle)
      && (!filters.billingKind || item.billingKinds.includes(filters.billingKind))
      && (!filters.renewal
        || (filters.renewal === "90" && renewalDays !== null && renewalDays >= 0 && renewalDays <= 90)
        || (filters.renewal === "overdue" && renewalDays !== null && renewalDays < 0)
        || (filters.renewal === "none" && renewal === null));
  });
}

const selectTriggerClass = "!h-9 w-full border-[#dfe5ee] bg-white shadow-sm";

export function ContractPortfolioTab({
  items,
  error,
  filters,
  onFiltersChange,
}: {
  items: ContractPortfolioItem[];
  error: string | null;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}) {
  const filtered = filterPortfolio(items, filters);
  const managers = [...new Map(items.filter((item) => item.managerId).map((item) => [item.managerId!, item.managerName])).entries()];
  const areas = [...new Set(items.flatMap((item) => item.areas))].sort();
  const tags = [...new Set(items.flatMap((item) => item.tags))].sort();
  const origins = [...new Set(items.map((item) => item.origin))].sort();
  const kinds = [...new Set(items.flatMap((item) => item.billingKinds))].sort();
  const patch = (next: Partial<Filters>) => onFiltersChange({ ...filters, ...next });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2">
            <span className="sr-only">Buscar cliente ou contrato</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" />
            <Input value={filters.search} onChange={(event) => patch({ search: event.target.value })} placeholder="Buscar cliente ou contrato" className="pl-9" />
          </label>
          <FilterSelect label="Gestor" value={filters.manager} options={managers} onChange={(manager) => patch({ manager })} />
          <FilterSelect label="Área" value={filters.area} options={areas.map((area) => [area, area])} onChange={(area) => patch({ area })} />
          <FilterSelect label="Etiqueta" value={filters.tag} options={tags.map((tag) => [tag, tag])} onChange={(tag) => patch({ tag })} />
          <FilterSelect label="Origem" value={filters.origin} options={origins.map((origin) => [origin, origin])} onChange={(origin) => patch({ origin })} />
          <FilterSelect label="Status" value={filters.lifecycle} options={Object.entries(lifecycleLabels)} onChange={(lifecycle) => patch({ lifecycle })} />
          <FilterSelect label="Cobrança" value={filters.billingKind} options={kinds.map((kind) => [kind, BILLING_KIND_LABELS[kind] ?? kind.replaceAll("_", " ")])} onChange={(billingKind) => patch({ billingKind })} />
          <FilterSelect label="Renovação" value={filters.renewal} options={[["90", "Próximos 90 dias"], ["overdue", "Vencida"], ["none", "Sem data"]]} onChange={(renewal) => patch({ renewal })} />
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div><p className="font-semibold">A carteira foi carregada parcialmente.</p><p className="mt-1">{error}</p></div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-zinc-900">Nenhum contrato encontrado</p>
          <p className="mt-1 text-sm text-zinc-500">Ajuste os filtros ou crie o cadastro-base a partir de uma oportunidade.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr><th className="px-4 py-3">Contrato</th><th className="px-4 py-3">Operação</th><th className="px-4 py-3">Projeção</th><th className="px-4 py-3">Renovação</th><th className="px-4 py-3">Configuração</th><th className="px-4 py-3"><span className="sr-only">Abrir</span></th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((item) => <PortfolioRow key={item.id} item={item} />)}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 lg:hidden">
            {filtered.map((item) => <PortfolioCard key={item.id} item={item} />)}
          </div>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  const labels = { __all__: "Todos", ...Object.fromEntries(options) };
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      <span>{label}</span>
      <Select
        items={labels}
        value={value || "__all__"}
        onValueChange={(next) => onChange(!next || next === "__all__" ? "" : next)}
      >
        <SelectTrigger className={selectTriggerClass}>
          <CrmSelectValue value={value || "__all__"} labels={labels} placeholder="Todos" />
        </SelectTrigger>
        <CrmSelectContent>
          <CrmSelectItem value="__all__">Todos</CrmSelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <CrmSelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </CrmSelectItem>
          ))}
        </CrmSelectContent>
      </Select>
    </label>
  );
}

function PortfolioRow({ item }: { item: ContractPortfolioItem }) {
  return (
    <tr className="align-top hover:bg-zinc-50/70">
      <td className="px-4 py-4">
        <p className="font-semibold text-zinc-900">{item.title}</p>
        <p className="mt-1 text-xs text-zinc-500">{item.clientName}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="outline">{lifecycleLabels[item.lifecycle]}</Badge>
          {item.renewalSoon ? (
            <Badge className="bg-amber-100 text-amber-800">Reajuste próximo</Badge>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-4">
        <CrmUserLabel name={item.managerName} size="xs" variant="inline" />
        <div className="mt-2 flex max-w-56 flex-wrap gap-1.5">
          {item.areas.length ? (
            item.areas.map((area) => <AreaIconLabel key={area} area={area} size="xs" />)
          ) : (
            <span className="text-xs text-zinc-500">Áreas pendentes</span>
          )}
        </div>
      </td>
      <td className="px-4 py-4 tabular-nums">
        <p className="font-medium">{money(item.monthlyProjectionCents)}/mês</p>
        <p className="mt-1 text-xs text-zinc-500">{money(item.annualReferenceCents)} anual</p>
      </td>
      <td className="px-4 py-4">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-4 text-zinc-400" />
          {date(item.renewalDate)}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <Progress value={item.setupProgress.percent} className="w-24" />
          <span className="text-xs tabular-nums text-zinc-500">{item.setupProgress.percent}%</span>
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <Link
          href={`/crm/contratos/${item.id}`}
          aria-label={`Abrir ${item.title}`}
          className="inline-flex size-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:border-teal-300 hover:text-teal-700"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </td>
    </tr>
  );
}

function PortfolioCard({ item }: { item: ContractPortfolioItem }) {
  return <Link href={`/crm/contratos/${item.id}`} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-teal-300">
    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-zinc-900">{item.title}</p><p className="mt-1 text-sm text-zinc-500">{item.clientName}</p></div><ArrowUpRight className="size-4 shrink-0 text-zinc-400" /></div>
    <div className="mt-3 flex flex-wrap gap-1"><Badge variant="outline">{lifecycleLabels[item.lifecycle]}</Badge>{item.renewalSoon ? <Badge className="bg-amber-100 text-amber-800">Reajuste próximo</Badge> : null}</div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">Projeção mensal</dt><dd className="mt-1 font-medium">{money(item.monthlyProjectionCents)}</dd></div><div><dt className="text-xs text-zinc-500">Renovação</dt><dd className="mt-1 font-medium">{date(item.renewalDate)}</dd></div></dl>
    <div className="mt-4 flex items-center gap-2"><Progress value={item.setupProgress.percent} className="flex-1" /><span className="text-xs tabular-nums text-zinc-500">{item.setupProgress.percent}%</span></div>
  </Link>;
}
