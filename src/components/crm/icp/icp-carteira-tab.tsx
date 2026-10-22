"use client";

/** Aba Carteira: faixas de honorário, distribuição da receita, tamanhos de cliente e áreas. */
import { useMemo, useRef, useState } from "react";
import { ChartColumn, ChartPie, CircleDollarSign, Clock, Crosshair, DoorOpen, Layers, Lightbulb, Timer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { HONORARIOS_MENSAIS } from "@/modules/icp/domain/plano-contas";
import {
  EMPLOYEE_BANDS,
  planSummary,
  rankedGroups,
  revenuePerHour,
  sizeBuckets,
  type IcpData,
  type IcpGroupRow,
  type IcpSizeBucketKey,
  type IcpTier,
  type IcpTierKey,
} from "@/modules/icp/domain/compute";
import { IcpAreaBadge, IcpAreaBadgeSpacer } from "./icp-area-icon";
import { PlanLegend, PlanMixBar, PlanoContasPanel } from "./icp-plano-contas-panel";
import { EMPLOYEE_BAND_TONE, INFO, SRC, TIER_TONE, overdueTone } from "./icp-content";
import { countOf, decimal, excludedRevenueNote, money, moneyOrDash, pct, ratio } from "./icp-format";
import { BarRow, Callout, Kpi, KpiGroup, Panel, ShareBar } from "./icp-primitives";
import { BucketListPanel, SizeCardsPanel, type IcpBucketView } from "./icp-size-panels";
import { SortableHead, nextSort, sortRows, type SortState } from "./icp-sort";

export function CarteiraTab({ data }: { data: IcpData }) {
  const [area, setArea] = useState<string | null>(null);
  const [selected, setSelected] = useState<IcpBucketView>("maiores");
  const listRef = useRef<HTMLElement>(null);
  const buckets = useMemo(() => sizeBuckets(data.groups, area), [data.groups, area]);
  const ranked = useMemo(() => rankedGroups(data.groups, area), [data.groups, area]);

  const withHours = data.groups.filter((g) => g.hours12m > 0);
  const revenueWithHours = withHours.reduce((acc, g) => acc + g.revenue12m, 0);
  const costWithHours = withHours.reduce((acc, g) => acc + g.deliveryCost, 0);
  const officeMargin = revenueWithHours > 0 ? (revenueWithHours - costWithHours) / revenueWithHours : null;
  const hoursWithRevenue = withHours.reduce((acc, g) => acc + g.hours12m, 0);
  const officeRevenuePerHour = revenuePerHour(data.groups.map((g) => ({ revenue: g.revenue12m, hours: g.hours12m })));
  const overdue = data.groups.reduce((acc, g) => acc + g.overdue, 0);

  function seeClients(key: IcpSizeBucketKey) {
    setSelected(key);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-4">
      <KpiGroup label="Indicadores da carteira" className="xl:grid-cols-5">
        <Kpi
          icon={CircleDollarSign}
          label="Receita em 12 meses"
          value={money(data.totals.revenue12m)}
          hint={
            data.totals.excludedPayers
              ? `${data.totals.payingGroups} grupos de clientes; sem ${money(data.totals.excludedRevenue)} de não clientes`
              : `${data.totals.payingGroups} grupos pagaram honorários`
          }
          source={SRC.honorarios}
          info={`${INFO.receita} ${excludedRevenueNote(data)}`.trim()}
        />
        <Kpi
          icon={Crosshair}
          label="ICP (faixas A e B)"
          value={`${data.totals.coreGroups} grupos`}
          hint={`${pct(data.totals.coreRevenueShare)} da receita`}
          source={SRC.honorarios}
          info={INFO.icp}
        />
        <Kpi
          icon={ChartColumn}
          label="Margem de contribuição"
          value={pct(officeMargin)}
          hint={`${withHours.length} grupos com horas apontadas`}
          source={SRC.custoPessoal}
          info={INFO.margemEscritorio}
        />
        <Kpi
          icon={Timer}
          label="Receita média por hora"
          value={moneyOrDash(officeRevenuePerHour)}
          hint={`média do escritório: ${withHours.length} grupos, ${Math.round(hoursWithRevenue).toLocaleString("pt-BR")} h lançadas`}
          source={SRC.timesheet}
          info={INFO.receitaHoraEscritorio}
        />
        <Kpi
          icon={Clock}
          label="Em atraso hoje"
          value={money(overdue)}
          hint={`${pct(ratio(overdue, data.totals.revenue12m))} da receita de 12 meses`}
          source={SRC.atraso}
          info={INFO.atraso}
        />
      </KpiGroup>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <TierPanel data={data} />
        <RevenueMixPanel data={data} />
      </div>

      <PlanoContasPanel data={data} />

      <SizeCardsPanel data={data} area={area} onAreaChange={setArea} buckets={buckets} onSeeClients={seeClients} />
      <BucketListPanel
        ref={listRef}
        buckets={buckets}
        all={ranked}
        selected={selected}
        onSelect={setSelected}
        showAreas={!area}
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AreasPanel data={data} />
        <BreadthPanel data={data} />
        <EntryPanel data={data} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Faixas */

/** Barra 100% com a divisão dos grupos por faixa de colaboradores (só quem tem porte). */
function EmployeeMixBar({ groups }: { groups: IcpGroupRow[] }) {
  const known = groups.filter((g) => g.employeeBand);
  if (known.length === 0) return <span className="text-muted-foreground">—</span>;
  const parts = EMPLOYEE_BANDS.map((b) => ({ ...b, count: known.filter((g) => g.employeeBand === b.key).length })).filter(
    (p) => p.count > 0,
  );
  return (
    <div className="w-full max-w-[180px]">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-(--radius-v2-sm)">
        {parts.map((p) => (
          <div
            key={p.key}
            className={EMPLOYEE_BAND_TONE[p.key]}
            title={`${p.label} colaboradores: ${p.count} ${p.count === 1 ? "grupo" : "grupos"}`}
            style={{ width: `${(p.count / known.length) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {known.length} de {groups.length} com porte
      </p>
    </div>
  );
}

function EmployeeBandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Colaboradores:</span>
      {EMPLOYEE_BANDS.map((b) => (
        <span key={b.key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", EMPLOYEE_BAND_TONE[b.key])} aria-hidden />
          {b.label}
        </span>
      ))}
    </div>
  );
}

const headClass = "text-xs font-medium text-muted-foreground";

type TierSortKey = "faixa" | "receita" | "porte" | "ticket" | "areas" | "pastas" | "receitaHora" | "tipo" | "atraso";

const avgFolders = (groups: IcpGroupRow[]) =>
  groups.length ? groups.reduce((acc, g) => acc + g.activeFolders, 0) / groups.length : null;

const decimalOrDash = (value: number | null) => (value == null ? "—" : decimal(value));

/** Parte da receita paga como HONORÁRIOS MENSAIS (ordena a coluna Tipo de contrato). */
function mensaisShare(groups: IcpGroupRow[]): number {
  return planSummary(groups).rows.find((r) => r.plan === HONORARIOS_MENSAIS)?.revenueShare ?? 0;
}

const groupHours = (groups: IcpGroupRow[]) => groups.map((g) => ({ revenue: g.revenue12m, hours: g.hours12m }));

function OverdueCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-10 text-right tabular-nums", value >= 0.5 && "font-semibold text-danger-text")}>{pct(value)}</span>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn("h-full rounded-full", overdueTone(value))}
          style={{ width: `${Math.min(100, Math.max(3, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

function TierPanel({ data }: { data: IcpData }) {
  const [sort, setSort] = useState<SortState<TierSortKey>>({ key: "faixa", desc: false });
  const onSort = (key: TierSortKey) => setSort((s) => nextSort(s, key));
  const groupsOf = (key: IcpTierKey) => data.groups.filter((g) => g.tier === key);
  const tiers = sortRows(data.tiers, sort, (t, key) => {
    const groups = groupsOf(t.key);
    if (key === "faixa") return t.key;
    if (key === "receita") return t.revenueShare;
    if (key === "porte") return groups.length ? groups.filter((g) => g.employeeBand).length / groups.length : null;
    if (key === "ticket") return t.avgMonthly;
    if (key === "areas") return t.avgAreas;
    if (key === "pastas") return avgFolders(groups);
    if (key === "receitaHora") return revenuePerHour(groupHours(groups));
    if (key === "tipo") return mensaisShare(groups);
    return t.overdueRatio;
  });

  const all = data.groups;
  const officeOverdue = all.reduce((acc, g) => acc + g.overdue, 0);
  const officeRevenuePerHour = revenuePerHour(groupHours(all));

  return (
    <Panel
      icon={Crosshair}
      title="Faixas da carteira"
      description="Quantos grupos há em cada faixa de honorários e quanto da receita eles geram"
      info={INFO.faixa}
      sources={[SRC.honorarios, SRC.timesheet, SRC.departamento, SRC.atraso]}
    >
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Faixa" sortKey="faixa" sort={sort} onSort={onSort} info={INFO.faixa} />
            <SortableHead
              label="Grupos e receita"
              sortKey="receita"
              sort={sort}
              onSort={onSort}
              info={INFO.participacao}
              className="w-[26%]"
            />
            <SortableHead label="Porte" sortKey="porte" sort={sort} onSort={onSort} info={INFO.porteFaixa} />
            <SortableHead label="Ticket/mês" sortKey="ticket" sort={sort} onSort={onSort} info={INFO.ticket} align="right" />
            <SortableHead label="Áreas" sortKey="areas" sort={sort} onSort={onSort} info={INFO.areasPorCliente} align="right" />
            <SortableHead
              label="Pastas ativas"
              sortKey="pastas"
              sort={sort}
              onSort={onSort}
              info={INFO.pastasAtivasFaixa}
              align="right"
            />
            <SortableHead
              label="Receita média/hora"
              sortKey="receitaHora"
              sort={sort}
              onSort={onSort}
              info={INFO.receitaHora}
              align="right"
            />
            <SortableHead label="Tipo de contrato" sortKey="tipo" sort={sort} onSort={onSort} info={INFO.tipoContratoOrdem} />
            <SortableHead label="Atraso" sortKey="atraso" sort={sort} onSort={onSort} info={INFO.atrasoReceita} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.key} className="hover:bg-transparent">
              <TableCell className="py-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      TIER_TONE[t.key].badge,
                    )}
                  >
                    {t.key}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{t.range}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.groups} grupos{t.key === "A" || t.key === "B" ? " · ICP" : ""}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="space-y-1.5 py-3">
                <ShareBar value={t.groupShare} label="dos grupos" />
                <ShareBar value={t.revenueShare} label="da receita" strong />
              </TableCell>
              <TableCell className="w-[18%] py-3">
                <EmployeeMixBar groups={data.groups.filter((g) => g.tier === t.key)} />
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">{money(t.avgMonthly)}</TableCell>
              <TableCell className="py-3 text-right tabular-nums">{decimal(t.avgAreas)}</TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {decimalOrDash(avgFolders(groupsOf(t.key)))}
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {moneyOrDash(revenuePerHour(groupHours(groupsOf(t.key))))}
              </TableCell>
              <TableCell className="w-[16%] py-3">
                <PlanMixBar groups={groupsOf(t.key)} />
              </TableCell>
              <TableCell className="py-3">
                <OverdueCell value={t.overdueRatio} />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border bg-surface-subtle hover:bg-surface-subtle">
            <TableCell className="py-3">
              <p className="font-semibold text-foreground">Escritório todo</p>
              <p className="text-xs text-muted-foreground">média de todas as faixas</p>
            </TableCell>
            <TableCell className="py-3 text-xs text-muted-foreground">
              {data.totals.payingGroups} grupos · {money(data.totals.revenue12m)}
            </TableCell>
            <TableCell className="py-3">
              <EmployeeMixBar groups={all} />
            </TableCell>
            <TableCell className="py-3 text-right font-semibold tabular-nums">
              {money(data.totals.payingGroups ? data.totals.revenue12m / data.totals.payingGroups / 12 : 0)}
            </TableCell>
            <TableCell className="py-3 text-right font-semibold tabular-nums">
              {decimal(all.length ? all.reduce((acc, g) => acc + g.areas.length, 0) / all.length : 0)}
            </TableCell>
            <TableCell className="py-3 text-right font-semibold tabular-nums">{decimalOrDash(avgFolders(all))}</TableCell>
            <TableCell className="py-3 text-right font-semibold tabular-nums">{moneyOrDash(officeRevenuePerHour)}</TableCell>
            <TableCell className="py-3">
              <PlanMixBar groups={all} />
            </TableCell>
            <TableCell className="py-3">
              <OverdueCell value={ratio(officeOverdue, data.totals.revenue12m) ?? 0} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="mt-3 space-y-1.5">
        <EmployeeBandLegend />
        <PlanLegend groups={data.groups} />
      </div>
    </Panel>
  );
}

/** Duas barras 100% empilhadas: quanto cada faixa é dos grupos e quanto é da receita. */
function RevenueMixPanel({ data }: { data: IcpData }) {
  const [hovered, setHovered] = useState<IcpTierKey | null>(null);
  const rows = [
    { key: "groups", label: "Grupos", total: `${data.totals.payingGroups} grupos`, share: (t: IcpTier) => t.groupShare },
    { key: "revenue", label: "Receita", total: money(data.totals.revenue12m), share: (t: IcpTier) => t.revenueShare },
  ];
  const top = data.tiers.find((t) => t.key === "A");

  return (
    <Panel
      icon={ChartPie}
      title="Distribuição da receita"
      description="Peso de cada faixa no número de grupos e na receita"
      info="Cada barra soma 100%. A de cima divide os grupos pagantes pelas faixas; a de baixo divide a receita de 12 meses."
      sources={[SRC.honorarios]}
    >
      <div className="space-y-5">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">{row.total}</span>
            </div>
            <div className="flex h-9 gap-0.5 overflow-hidden rounded-(--radius-v2-md)">
              {data.tiers.map((t) => {
                const share = row.share(t);
                if (share <= 0) return null;
                return (
                  <div
                    key={t.key}
                    className={cn(
                      "flex items-center justify-center text-xs font-semibold tabular-nums transition-opacity",
                      TIER_TONE[t.key].fill,
                      TIER_TONE[t.key].onFill,
                      hovered && hovered !== t.key && "opacity-40",
                    )}
                    style={{ width: `${share * 100}%` }}
                    title={`Faixa ${t.key} (${t.range}): ${pct(share)} ${row.key === "groups" ? "dos grupos" : "da receita"}`}
                    onMouseEnter={() => setHovered(t.key)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {share >= 0.07 ? pct(share) : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2">
        {data.tiers.map((t) => (
          <li
            key={t.key}
            className={cn("flex items-center gap-2 text-xs transition-opacity", hovered && hovered !== t.key && "opacity-40")}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={cn("size-2.5 shrink-0 rounded-full", TIER_TONE[t.key].fill)} aria-hidden />
            <span className="font-medium text-foreground">{t.key}</span>
            <span className="truncate text-muted-foreground">{t.range}</span>
          </li>
        ))}
      </ul>

      {top && (
        <Callout className="mt-5">
          A faixa A tem <span className="font-semibold">{pct(top.groupShare)}</span> dos grupos e gera{" "}
          <span className="font-semibold">{pct(top.revenueShare)}</span> da receita.
        </Callout>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------- Áreas */

function AreasPanel({ data }: { data: IcpData }) {
  const maxArea = Math.max(...data.areaRevenue.map((a) => a.share), 0.01);
  return (
    <Panel
      icon={Layers}
      title="Receita por área"
      description="Honorários de 12 meses pelo departamento que faturou"
      info={INFO.receitaArea}
      sources={[SRC.departamento]}
    >
      <div className="space-y-3">
        {data.areaRevenue.map((a) => (
          <BarRow
            key={a.label}
            icon={a.label !== "Outros" ? <IcpAreaBadge area={a.label} size="sm" /> : <IcpAreaBadgeSpacer />}
            label={a.label}
            hint={money(a.value)}
            value={a.share}
            max={maxArea}
            display={pct(a.share, 1)}
            barClassName={a.label === "Outros" ? "bg-neutral-300" : "bg-chart-1"}
          />
        ))}
      </div>
    </Panel>
  );
}

function BreadthPanel({ data }: { data: IcpData }) {
  const maxBreadth = Math.max(...data.breadth.map((b) => b.median), 1);
  const multiplier = data.totals.breadthMultiplier;
  return (
    <Panel
      icon={ChartColumn}
      title="Receita por número de áreas"
      description="Receita mediana em 12 meses pelo número de áreas que atendem o grupo"
      info={INFO.amplitude}
      sources={[SRC.departamento]}
    >
      <div className="flex h-56 items-end gap-4 border-b border-neutral-200 pb-2">
        {data.breadth.map((b, i) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">{money(b.median)}</span>
            <div
              className={cn(
                "w-full max-w-20 rounded-t-(--radius-v2-sm)",
                i === data.breadth.length - 1 ? "bg-chart-1" : "bg-interactive-300",
              )}
              style={{ height: `${Math.max(3, (b.median / maxBreadth) * 80)}%` }}
              title={`${b.label}: receita mediana de ${money(b.median)} (${b.groups} grupos)`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {data.breadth.map((b) => (
          <div key={b.label} className="flex-1 text-center">
            <p className="text-sm font-medium text-foreground">{b.label}</p>
            <p className="text-xs text-muted-foreground">{b.groups} grupos</p>
          </div>
        ))}
      </div>
      {multiplier != null && (
        <Callout icon={Lightbulb} className="mt-4">
          Quem usa 3 ou mais áreas paga <span className="font-semibold">{decimal(multiplier)}×</span> o que paga quem usa
          uma área só.
        </Callout>
      )}
    </Panel>
  );
}

function EntryPanel({ data }: { data: IcpData }) {
  const entryAreas = Array.from(new Set([...data.entry.core, ...data.entry.rest].map((e) => e.label)));
  const coreTotal = data.entry.core.reduce((acc, e) => acc + e.count, 0) || 1;
  const restTotal = data.entry.rest.reduce((acc, e) => acc + e.count, 0) || 1;

  return (
    <Panel
      icon={DoorOpen}
      title="1ª área com processo"
      description="Área do primeiro processo cadastrado de cada grupo"
      info={INFO.entrada}
      sources={[SRC.processos, SRC.honorarios]}
      className="lg:col-span-2 xl:col-span-1"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={headClass}>Área</TableHead>
            <TableHead className={cn(headClass, "text-right")}>Faixas A e B</TableHead>
            <TableHead className={cn(headClass, "text-right")}>Faixas C e D</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entryAreas.map((area) => {
            const c = countOf(data.entry.core, area);
            const r = countOf(data.entry.rest, area);
            return (
              <TableRow key={area} className="hover:bg-transparent">
                <TableCell className="whitespace-normal">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <IcpAreaBadge area={area} size="sm" />
                    <span className="truncate">{area}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="font-semibold text-foreground">{c}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{pct(c / coreTotal)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="text-foreground">{r}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{pct(r / restTotal)}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex flex-col-reverse rounded-(--radius-v2-md) bg-surface-subtle px-3 py-3">
          <dt className="text-xs leading-snug text-muted-foreground">grupos A e B têm o 1º processo em Insolvência</dt>
          <dd className="text-xl font-semibold tabular-nums text-foreground">
            {data.entry.coreViaInsolvency}
            <span className="text-xs font-medium text-muted-foreground"> de {data.totals.coreGroups}</span>
          </dd>
        </div>
        <div className="flex flex-col-reverse rounded-(--radius-v2-md) bg-surface-subtle px-3 py-3">
          <dt className="text-xs leading-snug text-muted-foreground">
            grupos A e B que começaram desde 2025 vieram por Insolvência
          </dt>
          <dd className="text-xl font-semibold tabular-nums text-foreground">
            {data.newCore.viaInsolvency}
            <span className="text-xs font-medium text-muted-foreground"> de {data.newCore.total}</span>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
