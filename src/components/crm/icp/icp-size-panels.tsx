"use client";

/**
 * Carteira › Maiores, médios e menores clientes: cartões por bloco, comparativo completo,
 * custo por hora das áreas e a lista de quem está em cada bloco.
 */
import { Fragment, createElement, useState } from "react";
import {
  ArrowRight,
  Building2,
  Calculator,
  ChartColumn,
  ChevronDown,
  Crown,
  ListOrdered,
  Search,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { HONORARIOS_MENSAIS } from "@/modules/icp/domain/plano-contas";
import {
  planSummary,
  revenuePerHour,
  type IcpData,
  type IcpSizeBucket,
  type IcpSizeBucketKey,
  type IcpSizedGroup,
} from "@/modules/icp/domain/compute";
import { IcpAreaBadge, IcpAreaBadgeSpacer, IcpAreaTag } from "./icp-area-icon";
import { GroupPlans, PlanDot, PlanStack } from "./icp-plano-contas";
import { SortableHead, nextSort, sortRows, type SortState, type SortValue } from "./icp-sort";
import { INFO, SIZE_BUCKET_LABEL, SRC } from "./icp-content";
import {
  decimal,
  groupName,
  hoursLabel,
  marginOf,
  money,
  moneyOrDash,
  noSectorLabel,
  pct,
  predominant,
  ratio,
} from "./icp-format";
import {
  CompanyLogo,
  EmployeeRange,
  LabelWithInfo,
  MiniBar,
  Panel,
  PanelHeader,
  SegmentedTabs,
  focusRing,
} from "./icp-primitives";

type MetricCell = { value: string; sub?: string; bar?: number | null; warn?: boolean };

type MetricRow = { label: string; info: string; cells: (b: IcpSizeBucket) => MetricCell };

const SIZE_METRIC_SECTIONS: { title: string; rows: MetricRow[] }[] = [
  {
    title: "Tamanho",
    rows: [
      {
        label: "Receita em 12 meses",
        info: INFO.receita,
        cells: (b) => ({
          value: money(b.revenue),
          sub: b.groups.length
            ? `${money(b.groups[b.groups.length - 1].revenue)} a ${money(b.groups[0].revenue)} por cliente`
            : undefined,
        }),
      },
      {
        label: "Ticket mensal médio",
        info: INFO.ticket,
        cells: (b) => ({ value: b.groups.length ? money(b.revenue / b.groups.length / 12) : "—" }),
      },
    ],
  },
  {
    title: "Esforço e rentabilidade",
    rows: [
      {
        label: "Horas por cliente",
        info: INFO.horas,
        cells: (b) => ({
          value: b.groups.length ? hoursLabel(b.hours / b.groups.length) : "—",
          sub: `${hoursLabel(b.hours)} no total`,
        }),
      },
      {
        label: "Receita média por hora",
        info: INFO.receitaHora,
        cells: (b) => ({ value: moneyOrDash(revenuePerHour(b.groups)) }),
      },
      {
        label: "Pastas ativas por cliente",
        info: INFO.pastasAtivas,
        cells: (b) => ({
          value: b.groups.length ? decimal(b.folders / b.groups.length) : "—",
          sub: `${b.folders.toLocaleString("pt-BR")} pastas no total`,
        }),
      },
      {
        label: "Custo de entrega",
        info: INFO.custo,
        cells: (b) => ({ value: money(b.cost), sub: b.hours > 0 ? `${money(b.cost / b.hours)} por hora` : undefined }),
      },
      {
        label: "Margem de contribuição",
        info: INFO.margem,
        cells: (b) => {
          const m = marginOf(b.revenue, b.cost, b.hours);
          return { value: pct(m), bar: m == null ? null : Math.max(0, m), warn: m != null && m < 0.3 };
        },
      },
    ],
  },
  {
    title: "Risco",
    rows: [
      {
        label: "Em atraso hoje",
        info: INFO.atraso,
        cells: (b) => {
          const r = ratio(b.overdue, b.revenue);
          return {
            value: money(b.overdue),
            sub: `${pct(r)} da receita de 12 meses`,
            bar: r == null ? null : Math.min(1, r),
            warn: r != null && r >= 0.5,
          };
        },
      },
    ],
  },
  {
    title: "Perfil",
    rows: [
      {
        label: "Segmento mais comum",
        info: INFO.segmento,
        cells: (b) => {
          const s = predominant(b.groups.map((g) => g.group.sectorBucket));
          return { value: s?.label ?? "—", sub: s ? `${s.count} de ${b.groups.length} clientes` : undefined };
        },
      },
      {
        label: "Tipo de contrato principal",
        info: INFO.tipoContrato,
        cells: (b) => {
          const rows = scopedPlanSummary(b.groups).rows;
          const top = [...rows].sort((x, y) => y.revenue - x.revenue)[0];
          return {
            value: top?.plan ?? "—",
            sub: top ? `${pct(top.revenueShare)} da receita; ${top.groups} de ${b.groups.length} clientes pagam nele` : undefined,
          };
        },
      },
    ],
  },
];

/** Ícone de cada bloco (neutro: a cor não carrega significado aqui). */
const SIZE_BUCKET_ICON: Record<IcpSizeBucketKey, LucideIcon> = {
  maiores: Crown,
  medios: ChartColumn,
  menores: UserRound,
};

function AreaFilter({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (area: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por área">
      {[null, ...options].map((a) => {
        const active = value === a;
        return (
          <button
            key={a ?? "todas"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(a)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-(--radius-v2-md) border py-1 pl-1 pr-3 text-[13px] font-medium transition-colors",
              focusRing,
              active
                ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                : "border-border bg-white text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {a ? (
              <IcpAreaBadge area={a} size="sm" />
            ) : (
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-(--radius-v2-sm) ring-1",
                  active ? "bg-white ring-interactive-300" : "bg-neutral-100 ring-neutral-200",
                )}
              >
                <Building2 className="size-3.5" aria-hidden />
              </span>
            )}
            {a ?? "Escritório todo"}
          </button>
        );
      })}
    </div>
  );
}

export function SizeCardsPanel({
  data,
  area,
  onAreaChange,
  buckets,
  onSeeClients,
}: {
  data: IcpData;
  area: string | null;
  onAreaChange: (area: string | null) => void;
  buckets: IcpSizeBucket[];
  onSeeClients: (key: IcpSizeBucketKey) => void;
}) {
  const [showComparison, setShowComparison] = useState(false);
  const areaOptions = data.areaRevenue.filter((a) => a.label !== "Outros").map((a) => a.label);
  const strong = "font-medium text-foreground";

  return (
    <Panel
      icon={Users}
      title="Maiores, médios e menores clientes"
      description={`Os 10 que mais pagam, os 10 do meio e os 10 que menos pagam em 12 meses${area ? ` em ${area}` : " no escritório"}`}
      info="Compara tamanho, esforço, rentabilidade e risco dos clientes por faixa de tamanho. Escolha uma área para ver só a receita, as horas e o atraso daquele departamento."
      sources={[SRC.honorarios, SRC.timesheet, SRC.custoPessoal, SRC.atraso, SRC.cnae]}
    >
      <AreaFilter options={areaOptions} value={area} onChange={onAreaChange} />

      {buckets[0] && buckets[0].rankedTotal > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-(--radius-v2-md) bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ListOrdered className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
          <p>
            <span className={strong}>Como separamos:</span> os{" "}
            <span className={strong}>{buckets[0].rankedTotal} grupos</span> que pagaram honorários nos últimos 12 meses
            {area ? ` em ${area}` : ""} são ordenados da maior para a menor receita. Os{" "}
            <span className={strong}>maiores</span> são os 10 primeiros; os <span className={strong}>médios</span>, os 10
            do meio da lista, em volta da mediana de {money(buckets[0].medianRevenue)} em 12 meses; os{" "}
            <span className={strong}>menores</span>, os 10 últimos.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {buckets.map((b) => {
          const n = b.groups.length;
          const margin = marginOf(b.revenue, b.cost, b.hours);
          const overdueShare = ratio(b.overdue, b.revenue);
          return (
            <div key={b.key} className="flex flex-col rounded-(--radius-v2-lg) border border-border p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-neutral-50 text-muted-foreground">
                  {createElement(SIZE_BUCKET_ICON[b.key], { className: "size-4", "aria-hidden": true })}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{SIZE_BUCKET_LABEL[b.key].title}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.rankFrom ? `posições ${b.rankFrom} a ${b.rankTo} de ${b.rankedTotal}` : SIZE_BUCKET_LABEL[b.key].hint}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-2xl font-semibold tracking-[-0.02em] tabular-nums text-foreground">{money(b.revenue)}</p>
              <p className="text-xs text-muted-foreground">receita em 12 meses</p>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Ticket mensal</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">{n ? money(b.revenue / n / 12) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Margem</dt>
                  <dd
                    className={cn(
                      "text-sm font-semibold tabular-nums text-foreground",
                      margin != null && margin < 0.3 && "text-warning-text",
                    )}
                  >
                    {pct(margin)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Em atraso</dt>
                  <dd
                    className={cn(
                      "text-sm font-semibold tabular-nums text-foreground",
                      overdueShare != null && overdueShare >= 0.5 && "text-danger-text",
                    )}
                  >
                    {money(b.overdue)}
                  </dd>
                  <dd className="text-xs text-muted-foreground">{pct(overdueShare)} da receita</dd>
                </div>
              </dl>

              <BucketPlans bucket={b} />

              <Button
                variant="link"
                size="sm"
                onClick={() => onSeeClients(b.key)}
                className="mt-4 h-auto self-start px-0 text-xs text-interactive-700"
              >
                Ver clientes
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        aria-expanded={showComparison}
        onClick={() => setShowComparison((v) => !v)}
        className="mt-4 text-xs text-interactive-700 hover:bg-interactive-50"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", showComparison && "rotate-180")} aria-hidden />
        {showComparison ? "Ocultar comparativo completo" : "Ver comparativo completo (horas, custo, receita por hora e segmento)"}
      </Button>

      {showComparison && <ComparisonTable buckets={buckets} />}

      <div className="mt-4 flex items-start gap-2.5 rounded-(--radius-v2-md) bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Calculator className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
        <div className="space-y-1">
          <p>
            <span className={strong}>Como calculamos a margem:</span> (receita − custo de entrega) ÷ receita.
          </p>
          <p>
            <span className={strong}>Receita:</span> honorários pagos nos últimos 12 meses, no financeiro do VIOS.{" "}
            <span className={strong}>Custo de entrega:</span> horas lançadas para o cliente no timesheet do VIOS × custo da
            hora da área. <span className={strong}>Custo da hora:</span> custo de pessoal da área no financeiro do VIOS
            (remuneração, encargos e benefícios) ÷ todas as horas que a área lançou no período.
          </p>
          <p>
            Não entram sócios, estrutura e despesas gerais. Cliente sem horas lançadas fica sem margem. O critério do custo
            da hora ainda está em definição.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** Planos de contas dos grupos no mesmo recorte da receita (escritório ou área). */
function scopedPlanSummary(groups: IcpSizedGroup[]) {
  return planSummary(groups.map((g) => ({ revenue12m: g.revenue, revenueByPlan: g.revenueByPlan })));
}

/** Tipo de contrato do bloco: receita dos grupos por plano de contas do SIOE. */
function BucketPlans({ bucket }: { bucket: IcpSizeBucket }) {
  const plans = scopedPlanSummary(bucket.groups);
  if (plans.rows.length === 0) return null;
  const shown = plans.rows.slice(0, 3);
  return (
    <div className="mt-3 border-t border-border pt-3">
      <LabelWithInfo label="Tipo de contrato" info={INFO.tipoContrato} className="text-xs text-muted-foreground" />
      <PlanStack rows={plans.rows} className="mt-2" />
      <ul className="mt-2 space-y-1">
        {shown.map((r) => (
          <li key={r.plan} className="flex items-center gap-1.5 text-xs text-foreground">
            <PlanDot plan={r.plan} className="size-2" />
            <span className="min-w-0 flex-1 truncate">{r.plan}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {r.groups} · {pct(r.revenueShare)}
            </span>
          </li>
        ))}
        {plans.rows.length > shown.length && (
          <li className="text-xs text-muted-foreground">
            +{plans.rows.length - shown.length} {plans.rows.length - shown.length === 1 ? "plano" : "planos"}:{" "}
            {plans.rows
              .slice(shown.length)
              .map((r) => r.plan)
              .join(", ")}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Comparativo completo: uma coluna por bloco, métricas agrupadas por tema. */
function ComparisonTable({ buckets }: { buckets: IcpSizeBucket[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th className="w-[28%]">
              <span className="sr-only">Métrica</span>
            </th>
            {buckets.map((b) => (
              <th key={b.key} scope="col" className="px-2 pb-2 text-left align-bottom">
                <div className="rounded-(--radius-v2-md) bg-surface-subtle px-3 py-2">
                  <span className="block text-sm font-semibold text-foreground">{SIZE_BUCKET_LABEL[b.key].title}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{SIZE_BUCKET_LABEL[b.key].hint}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        {SIZE_METRIC_SECTIONS.map((section) => (
          <tbody key={section.title}>
            <tr>
              <th colSpan={4} scope="colgroup" className="pb-1 pt-4 text-left text-xs font-semibold text-foreground">
                {section.title}
              </th>
            </tr>
            {section.rows.map((row) => (
              <tr key={row.label} className="border-t border-dashed border-neutral-200 first:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left align-top text-xs font-normal text-muted-foreground">
                  <LabelWithInfo label={row.label} info={row.info} />
                </th>
                {buckets.map((b) => {
                  const cell = row.cells(b);
                  return (
                    <td key={b.key} className="px-2 py-2.5 align-top">
                      <div className="px-3">
                        <span className={cn("font-semibold tabular-nums text-foreground", cell.warn && "text-warning-text")}>
                          {cell.value}
                        </span>
                        {cell.sub && <span className="block text-xs leading-snug text-muted-foreground">{cell.sub}</span>}
                        {cell.bar != null && <MiniBar value={cell.bar} warn={cell.warn} />}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Bloco mostrado na lista: um dos três blocos ou todos os clientes pagantes. */
export type IcpBucketView = IcpSizeBucketKey | "todos";

/** Em "Todos", quantos grupos aparecem antes de expandir a lista. */
const ALL_PREVIEW = 25;

type BucketSortKey = "grupo" | "areas" | "tipo" | "receita" | "pastas" | "horas" | "receitaHora" | "margem" | "atraso";

function bucketSortValue(g: IcpSizedGroup, key: BucketSortKey): SortValue {
  switch (key) {
    case "grupo":
      return groupName(g.grupo).toLowerCase();
    case "areas":
      return g.group.areas.length;
    case "tipo": {
      // Parte da receita em HONORÁRIOS MENSAIS.
      const total = Object.values(g.revenueByPlan).reduce((acc, v) => acc + v, 0);
      return total > 0 ? (g.revenueByPlan[HONORARIOS_MENSAIS] ?? 0) / total : null;
    }
    case "receita":
      return g.revenue;
    case "pastas":
      return g.folders;
    case "horas":
      return g.hours;
    case "receitaHora":
      return g.hours > 0 ? g.revenue / g.hours : null;
    case "margem":
      return marginOf(g.revenue, g.cost, g.hours);
    case "atraso":
      return g.overdue;
  }
}

export function BucketListPanel({
  ref,
  buckets,
  all,
  selected,
  onSelect,
  showAreas,
}: {
  ref: React.Ref<HTMLElement>;
  buckets: IcpSizeBucket[];
  /** Todos os grupos pagantes, da maior para a menor receita (mesmo ranking dos blocos). */
  all: IcpSizedGroup[];
  selected: IcpBucketView;
  onSelect: (key: IcpBucketView) => void;
  /** No escritório todo, mostra as áreas que faturaram para cada grupo. */
  showAreas: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Padrão: ranking por receita (do maior para o menor), como os blocos.
  const [sort, setSort] = useState<SortState<BucketSortKey>>({ key: "receita", desc: true });
  const onSort = (key: BucketSortKey) => setSort((s) => nextSort(s, key));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const isAll = selected === "todos";
  const current = isAll ? null : (buckets.find((b) => b.key === selected) ?? buckets[0]);
  const list = isAll ? all : (current?.groups ?? []);
  const rankOf = new Map(all.map((g, i) => [g.grupo, i + 1]));
  const q = query.trim().toLowerCase();
  const filtered = sortRows(
    list.filter((g) => !q || g.grupo.toLowerCase().includes(q) || (g.group.sector ?? "").toLowerCase().includes(q)),
    sort,
    bucketSortValue,
  );
  // Busca sempre mostra tudo o que encontrou; sem busca, "Todos" começa pelos primeiros.
  const collapsed = isAll && !q && !showAll && filtered.length > ALL_PREVIEW;
  const rows = collapsed ? filtered.slice(0, ALL_PREVIEW) : filtered;
  const columns = showAreas ? 9 : 8;

  function toggleRow(grupo: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) next.delete(grupo);
      else next.add(grupo);
      return next;
    });
  }

  return (
    <section ref={ref} className="min-w-0 scroll-mt-24 rounded-(--radius-v2-xl) border border-border bg-white p-4 sm:p-5">
      <PanelHeader
        icon={Users}
        title="Quem está em cada bloco"
        description={
          isAll
            ? `Todos os ${all.length} clientes que pagaram honorários em 12 meses. Clique no título de uma coluna para ordenar.`
            : "Receita, tipo de contrato, horas, receita média por hora, margem e atraso de cada grupo. Clique no título de uma coluna para ordenar."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedTabs<IcpBucketView>
              options={[
                ...buckets.map((b) => ({ key: b.key as IcpBucketView, label: SIZE_BUCKET_LABEL[b.key].title })),
                { key: "todos", label: `Todos (${all.length})` },
              ]}
              value={isAll ? "todos" : (current?.key ?? selected)}
              onChange={(key) => {
                setShowAll(false);
                onSelect(key);
              }}
              label="Bloco de clientes"
            />
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar grupo ou atividade"
                className="h-9 pl-8"
                aria-label="Buscar grupo ou atividade"
              />
            </div>
          </div>
        }
      />

      <Table className={showAreas ? "min-w-[1220px]" : "min-w-[1020px]"}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Grupo" sortKey="grupo" sort={sort} onSort={onSort} />
            {showAreas && <SortableHead label="Áreas" sortKey="areas" sort={sort} onSort={onSort} info={INFO.areasGrupo} />}
            <SortableHead label="Tipo de contrato" sortKey="tipo" sort={sort} onSort={onSort} info={INFO.tipoContratoOrdem} />
            <SortableHead label="Receita 12 meses" sortKey="receita" sort={sort} onSort={onSort} info={INFO.receita} align="right" />
            <SortableHead label="Pastas ativas" sortKey="pastas" sort={sort} onSort={onSort} info={INFO.pastasAtivas} align="right" />
            <SortableHead label="Horas" sortKey="horas" sort={sort} onSort={onSort} info={INFO.horas} align="right" />
            <SortableHead
              label="Receita média/hora"
              sortKey="receitaHora"
              sort={sort}
              onSort={onSort}
              info={INFO.receitaHora}
              align="right"
            />
            <SortableHead label="Margem" sortKey="margem" sort={sort} onSort={onSort} info={INFO.margem} className="pl-6" />
            <SortableHead label="Em atraso" sortKey="atraso" sort={sort} onSort={onSort} info={INFO.atraso} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => {
            const margin = marginOf(g.revenue, g.cost, g.hours);
            const expanded = open.has(g.grupo);
            return (
              <Fragment key={g.grupo}>
                <TableRow className={cn(expanded && "border-b-0 bg-surface-subtle hover:bg-surface-subtle")}>
                  <TableCell className={cn("min-w-[260px] whitespace-normal py-3 align-top", showAreas ? "w-[28%]" : "w-[34%]")}>
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 px-1.5 text-xs font-semibold tabular-nums text-neutral-600">
                        {rankOf.get(g.grupo) ?? "—"}
                      </span>
                      <CompanyLogo group={g.group} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleRow(g.grupo)}
                          className={cn(
                            "flex max-w-full items-center gap-1 rounded-(--radius-v2-sm) text-left font-medium text-foreground hover:text-interactive-700",
                            focusRing,
                          )}
                          title={g.grupo}
                        >
                          <span className="truncate">{groupName(g.grupo)}</span>
                          <ChevronDown
                            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                        {g.group.sectorBucket ? (
                          <div className="mt-1 flex items-start gap-1.5">
                            <span className="shrink-0 rounded-(--radius-v2-sm) bg-neutral-100 px-1.5 py-0.5 text-xs font-medium leading-none text-neutral-700">
                              {g.group.sectorBucket}
                            </span>
                            {g.group.sector && (
                              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground" title={g.group.sector}>
                                {g.group.sector}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">{noSectorLabel(g.group.clientType)}</p>
                        )}
                        {g.group.profile?.employeeRange && (
                          <div className="mt-1 text-xs">
                            <EmployeeRange group={g.group} variant="inline" />
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {showAreas && (
                    <TableCell className="whitespace-normal py-3 align-top">
                      {g.group.areas.length ? (
                        <div className="flex max-w-[230px] flex-wrap gap-1">
                          {g.group.areas.slice(0, 3).map((a) => (
                            <IcpAreaTag key={a} area={a} />
                          ))}
                          {g.group.areas.length > 3 && (
                            <span
                              className="inline-flex items-center rounded-(--radius-v2-sm) bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                              title={g.group.areas.slice(3).join(", ")}
                            >
                              +{g.group.areas.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Outros departamentos</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="min-w-[220px] whitespace-normal py-3 align-top">
                    <GroupPlans revenueByPlan={g.revenueByPlan} />
                  </TableCell>
                  <TableCell className="py-3 text-right align-top tabular-nums">
                    <span className="font-semibold text-foreground">{money(g.revenue)}</span>
                    <span className="block text-xs text-muted-foreground">{money(g.revenue / 12)}/mês</span>
                  </TableCell>
                  <TableCell className="py-3 text-right align-top tabular-nums">{g.folders > 0 ? g.folders : "—"}</TableCell>
                  <TableCell className="py-3 text-right align-top tabular-nums">{g.hours > 0 ? hoursLabel(g.hours) : "—"}</TableCell>
                  <TableCell className="py-3 text-right align-top tabular-nums">
                    {g.hours > 0 ? money(g.revenue / g.hours) : "—"}
                  </TableCell>
                  <TableCell
                    className="py-3 pl-6 align-top"
                    title={g.hours > 0 ? `Custo de entrega: ${money(g.cost)}` : "Sem horas apontadas"}
                  >
                    {margin == null ? (
                      <span className="text-xs text-muted-foreground">sem horas</span>
                    ) : g.hours < 10 ? (
                      <span className="text-xs text-muted-foreground" title="Menos de 10 horas apontadas: a margem não é confiável">
                        {pct(margin)} · poucas horas
                      </span>
                    ) : (
                      <>
                        <span className={cn("tabular-nums", margin < 0.3 && "font-semibold text-warning-text")}>{pct(margin)}</span>
                        <MiniBar value={Math.max(0, margin)} warn={margin < 0.3} />
                      </>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-right align-top tabular-nums">
                    {g.overdue > 0 ? (
                      <>
                        <span className={cn(g.overdue > g.revenue * 0.5 && "font-semibold text-danger-text")}>{money(g.overdue)}</span>
                        <span className="block text-xs text-muted-foreground">{pct(g.overdue / g.revenue)} da receita</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                    <TableCell colSpan={columns} className="whitespace-normal px-4 pb-4 pt-0">
                      <RankedGroupDetail group={g} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns} className="py-8 text-center text-sm text-muted-foreground">
                {q ? "Nenhum grupo com essa busca neste bloco." : "Nenhum cliente neste bloco."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {isAll && !q && filtered.length > ALL_PREVIEW && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {collapsed ? `Mostrando ${rows.length} de ${filtered.length} clientes` : `Mostrando todos os ${filtered.length} clientes`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-interactive-700 hover:bg-interactive-50"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", !collapsed && "rotate-180")} aria-hidden />
            {collapsed ? `Mostrar todos os ${filtered.length} clientes` : `Mostrar só os ${ALL_PREVIEW} primeiros`}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Detalhe aberto na linha: valor de cada plano de contas e receita por área. */
function RankedGroupDetail({ group: g }: { group: IcpSizedGroup }) {
  const areas = Object.entries(g.group.byArea)
    .filter(([, m]) => m.revenue > 0)
    .sort((a, b) => b[1].revenue - a[1].revenue);
  return (
    <div className="grid gap-4 rounded-(--radius-v2-lg) border border-border bg-white p-4 md:grid-cols-3">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold text-foreground">Tipo de contrato (plano de contas)</p>
        <GroupPlans revenueByPlan={g.revenueByPlan} withValues />
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold text-foreground">Receita por área</p>
        {areas.length ? (
          <ul className="space-y-1">
            {areas.map(([area, m]) => (
              <li key={area} className="flex items-center gap-2 text-xs">
                {area !== "Outros" ? <IcpAreaBadge area={area} size="sm" /> : <IcpAreaBadgeSpacer />}
                <span className="min-w-0 flex-1 truncate">{area}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{money(m.revenue)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <dl className="grid min-w-0 grid-cols-2 content-start gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Faixa</dt>
          <dd className="font-semibold text-foreground">{g.group.tier}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ticket mensal</dt>
          <dd className="font-semibold tabular-nums text-foreground">{money(g.group.monthly)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sede</dt>
          <dd className="text-foreground">{g.group.city ? `${g.group.city}${g.group.uf ? ` · ${g.group.uf}` : ""}` : (g.group.uf ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Custo de entrega</dt>
          <dd className="tabular-nums text-foreground">{g.hours > 0 ? money(g.cost) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pastas ativas</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {g.folders}
            {g.group.activeFolders !== g.folders && (
              <span className="ml-1 font-normal text-muted-foreground">de {g.group.activeFolders} no grupo</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
