"use client";

/**
 * Aba Inadimplência: honorários vencidos e em aberto na data do cálculo, por faixa, por tempo
 * desde o vencimento, por área e por grupo, incluindo quem deve e não pagou nada em 12 meses.
 */
import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, CircleDollarSign, Crosshair, Download, History, Layers, Lightbulb, Search, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { OVERDUE_AGING, daysOverdue, type IcpData, type IcpOverdueAging, type IcpOverdueAgingKey } from "@/modules/icp/domain/compute";
import { IcpAreaBadge, IcpAreaBadgeSpacer } from "./icp-area-icon";
import { AGING_TONE, INFO, SRC, TIER_SCOPES, TIER_TONE } from "./icp-content";
import { formatDate, groupName, hoursLabel, money, moneyOrDash, pct, ratio } from "./icp-format";
import {
  BarRow,
  Callout,
  CompanyLogo,
  FilterChip,
  Kpi,
  KpiGroup,
  OverdueCell,
  Panel,
  PanelHeader,
  SegmentedTabs,
  ShareBar,
} from "./icp-primitives";
import {
  NO_PAYMENT,
  NO_PAYMENT_LABEL,
  debtorAreas,
  debtorsInScope,
  debtorsOf,
  downloadDebtorsCsv,
  overdueAgeLabel,
  overdueByAge,
  overdueByArea,
  overdueByTier,
  overdueTotalRow,
  type DebtorTier,
  type IcpDebtor,
  type IcpOverdueTierRow,
  type OverdueScope,
} from "./icp-overdue";
import { SortableHead, nextSort, sortRows, type SortState } from "./icp-sort";

const headClass = "text-xs font-medium text-muted-foreground";

export function InadimplenciaTab({ data }: { data: IcpData }) {
  const debtors = useMemo(() => debtorsOf(data), [data]);
  const tierRows = useMemo(() => overdueByTier(data, debtors), [data, debtors]);

  const total = debtors.reduce((acc, d) => acc + d.overdue, 0);
  const paying = debtors.filter((d) => d.tier !== NO_PAYMENT);
  const payingOverdue = paying.reduce((acc, d) => acc + d.overdue, 0);
  const outside = debtors.filter((d) => d.tier === NO_PAYMENT);
  const outsideOverdue = total - payingOverdue;
  const overOneYear = debtors.reduce((acc, d) => acc + (d.overdueAging.mais365 ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <KpiGroup label="Indicadores de inadimplência">
        <Kpi
          icon={CircleDollarSign}
          label="Em atraso hoje"
          value={money(total)}
          hint={`${debtors.length} grupos com honorário vencido em aberto`}
          source={SRC.atraso}
          info={INFO.atrasoTotal}
        />
        <Kpi
          icon={Crosshair}
          label="Atraso de quem paga"
          value={money(payingOverdue)}
          hint={`${pct(ratio(payingOverdue, data.totals.revenue12m))} da receita de 12 meses · ${paying.length} de ${data.totals.payingGroups} grupos`}
          source={SRC.atraso}
          info={INFO.atrasoPagantes}
        />
        <Kpi
          icon={UserX}
          label={NO_PAYMENT_LABEL}
          value={money(outsideOverdue)}
          hint={`${outside.length} grupos devem e não pagaram nada no período · ${pct(ratio(outsideOverdue, total))} do atraso`}
          source={SRC.atraso}
          info={INFO.atrasoSemPagamento}
        />
        <Kpi
          icon={History}
          label="Vencido há mais de 1 ano"
          value={money(overOneYear)}
          hint={`${pct(ratio(overOneYear, total))} de todo o valor em atraso`}
          source={SRC.atraso}
          info={INFO.atrasoAntigo}
        />
      </KpiGroup>

      <OverdueTierPanel rows={tierRows} total={total} debtors={debtors} />
      <AgeAndAreaPanel debtors={debtors} />
      <DebtorsPanel data={data} debtors={debtors} />
    </div>
  );
}

/* ----------------------------------------------------------- Tempo de atraso */

/** Barra 100% com o valor em aberto por tempo desde o vencimento. */
function AgingBar({ aging, className }: { aging: IcpOverdueAging; className?: string }) {
  const known = OVERDUE_AGING.reduce((acc, a) => acc + (aging[a.key] ?? 0), 0);
  if (known <= 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className={cn("flex h-2.5 w-full max-w-[160px] gap-0.5 overflow-hidden rounded-(--radius-v2-sm)", className)}>
      {OVERDUE_AGING.map((a) => {
        const value = aging[a.key] ?? 0;
        if (value <= 0) return null;
        return (
          <div
            key={a.key}
            className={AGING_TONE[a.key]}
            style={{ width: `${(value / known) * 100}%` }}
            title={`${a.label}: ${money(value)} (${pct(value / known)})`}
          />
        );
      })}
    </div>
  );
}

function AgingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Tempo desde o vencimento:</span>
      {OVERDUE_AGING.map((a) => (
        <span key={a.key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", AGING_TONE[a.key])} aria-hidden />
          {a.label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Por faixa */

function TierBadge({ tier, size = "md" }: { tier: DebtorTier; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-6 text-[11px]" : "size-7 text-xs";
  if (tier === NO_PAYMENT) {
    return (
      <span
        title={NO_PAYMENT_LABEL}
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-700", box)}
      >
        <UserX className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span
      title={`Faixa ${tier}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", TIER_TONE[tier].badge, box)}
    >
      {tier}
    </span>
  );
}

type TierSortKey = "faixa" | "devedores" | "atraso" | "ratio" | "media" | "mais1ano";

type TierValues = Omit<IcpOverdueTierRow, "key" | "range">;

const overOneYearShare = (r: TierValues) => (r.overdue > 0 ? r.aging.mais365 / r.overdue : null);

function TierCells({ row, strong, ofGroups }: { row: TierValues; strong?: boolean; ofGroups?: boolean }) {
  const value = cn("py-3 text-right tabular-nums", strong && "font-semibold");
  const olderShare = overOneYearShare(row);
  return (
    <>
      <TableCell className={value}>
        {row.debtors}
        {ofGroups && row.groups > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">
            de {row.groups} · {pct(row.debtors / row.groups)}
          </span>
        )}
      </TableCell>
      <TableCell className={value}>{money(row.overdue)}</TableCell>
      <TableCell className="py-3">
        <ShareBar value={row.share} label="do total" strong />
      </TableCell>
      <TableCell className="py-3">
        {row.ratio == null ? <span className="text-xs text-muted-foreground">sem receita</span> : <OverdueCell value={row.ratio} />}
      </TableCell>
      <TableCell className={value}>{moneyOrDash(row.avgPerDebtor)}</TableCell>
      <TableCell className="py-3">
        <AgingBar aging={row.aging} />
      </TableCell>
      <TableCell className={cn(value, olderShare != null && olderShare >= 0.5 && "text-danger-text")}>
        {olderShare == null ? "—" : pct(olderShare)}
      </TableCell>
    </>
  );
}

function OverdueTierPanel({
  rows,
  total,
  debtors,
}: {
  rows: IcpOverdueTierRow[];
  total: number;
  debtors: IcpDebtor[];
}) {
  const [sort, setSort] = useState<SortState<TierSortKey>>({ key: "faixa", desc: false });
  const onSort = (key: TierSortKey) => setSort((s) => nextSort(s, key));
  const tierRows = rows.filter((r) => r.key !== NO_PAYMENT);
  const outsideRow = rows.find((r) => r.key === NO_PAYMENT);
  const sorted = sortRows(tierRows, sort, (r, key) => {
    if (key === "faixa") return r.key;
    if (key === "devedores") return r.groups ? r.debtors / r.groups : null;
    if (key === "atraso") return r.overdue;
    if (key === "ratio") return r.ratio;
    if (key === "media") return r.avgPerDebtor;
    return overOneYearShare(r);
  });
  const officeRow = overdueTotalRow(rows, total);
  const payingRow = overdueTotalRow(tierRows, total);

  // Destaques: faixa que mais concentra o atraso, faixa em que o atraso passa da receita e
  // quem deve sem ter pago nada em 12 meses.
  const top = [...tierRows].sort((a, b) => b.overdue - a.overdue)[0];
  const worst = [...tierRows].filter((r) => (r.ratio ?? 0) >= 1).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
  const worstDebtors = worst ? debtors.filter((d) => d.tier === worst.key).slice(0, 3) : [];
  const outside = debtors.filter((d) => d.tier === NO_PAYMENT);
  const outsideWithFolders = outside.filter((d) => d.activeFolders > 0).length;

  return (
    <Panel
      icon={Crosshair}
      title="Atraso por faixa"
      description="Quantos grupos de cada faixa devem, quanto devem e há quanto tempo"
      info={INFO.faixa}
      sources={[SRC.atraso, SRC.honorarios]}
    >
      <Table className="min-w-[980px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Faixa" sortKey="faixa" sort={sort} onSort={onSort} info={INFO.faixa} />
            <SortableHead
              label="Grupos com atraso"
              sortKey="devedores"
              sort={sort}
              onSort={onSort}
              info={INFO.devedoresFaixa}
              align="right"
            />
            <SortableHead label="Em atraso" sortKey="atraso" sort={sort} onSort={onSort} info={INFO.atrasoTotal} align="right" />
            <TableHead className={cn(headClass, "w-[17%]")}>Parte do atraso</TableHead>
            <SortableHead label="Atraso ÷ receita" sortKey="ratio" sort={sort} onSort={onSort} info={INFO.atrasoReceita} />
            <SortableHead
              label="Média por grupo"
              sortKey="media"
              sort={sort}
              onSort={onSort}
              info={INFO.mediaDevedor}
              align="right"
            />
            <TableHead className={cn(headClass, "w-[15%]")}>Tempo de atraso</TableHead>
            <SortableHead
              label="Mais de 1 ano"
              sortKey="mais1ano"
              sort={sort}
              onSort={onSort}
              info={INFO.atrasoAntigo}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.key} className="hover:bg-transparent">
              <TableCell className="py-3">
                <div className="flex items-center gap-2.5">
                  <TierBadge tier={r.key} />
                  <div>
                    <p className="font-medium text-foreground">{r.range}</p>
                    <p className="text-xs text-muted-foreground">
                      {money(r.revenue ?? 0)} de receita{r.key === "A" || r.key === "B" ? " · ICP" : ""}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TierCells row={r} ofGroups />
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border hover:bg-transparent">
            <TableCell className="py-3">
              <p className="font-medium text-foreground">Pagantes (A a E)</p>
              <p className="text-xs text-muted-foreground">pagaram honorários em 12 meses</p>
            </TableCell>
            <TierCells row={payingRow} ofGroups />
          </TableRow>
          {outsideRow && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="py-3">
                <div className="flex items-center gap-2.5">
                  <TierBadge tier={NO_PAYMENT} />
                  <div>
                    <p className="font-medium text-foreground">{NO_PAYMENT_LABEL}</p>
                    <p className="text-xs text-muted-foreground">fora das faixas, que são pela receita</p>
                  </div>
                </div>
              </TableCell>
              <TierCells row={outsideRow} />
            </TableRow>
          )}
          <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
            <TableCell className="py-3">
              <p className="font-semibold text-foreground">Escritório todo</p>
              <p className="text-xs text-muted-foreground">atraso/receita só dos pagantes</p>
            </TableCell>
            <TierCells row={{ ...officeRow, ratio: payingRow.ratio }} strong />
          </TableRow>
        </TableBody>
      </Table>
      <div className="mt-3">
        <AgingLegend />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {top && top.overdue > 0 && (
          <Callout icon={Lightbulb}>
            A faixa <span className="font-semibold">{top.key}</span> concentra{" "}
            <span className="font-semibold">{pct(top.share)}</span> de todo o atraso ({money(top.overdue)}), com {top.debtors} de{" "}
            {top.groups} grupos devendo.
          </Callout>
        )}
        {worst && (
          <Callout icon={Lightbulb}>
            Na faixa <span className="font-semibold">{worst.key}</span> o atraso ({money(worst.overdue)}) passa da receita de 12
            meses ({money(worst.revenue ?? 0)}). Os maiores:{" "}
            {worstDebtors.map((d, i) => (
              <span key={d.grupo}>
                {i > 0 && (i === worstDebtors.length - 1 ? " e " : ", ")}
                {groupName(d.grupo)} ({money(d.overdue)})
              </span>
            ))}
            .
          </Callout>
        )}
        {outside.length > 0 && (
          <Callout icon={Lightbulb}>
            <span className="font-semibold">{money(outsideRow?.overdue ?? 0)}</span> ({pct(outsideRow?.share)} do atraso) é de{" "}
            {outside.length} grupos que não pagaram nada em 12 meses; {outsideWithFolders} deles ainda têm pastas ativas no VIOS.
          </Callout>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Só entra quem está cadastrado como cliente no VIOS; parcelas de parte contrária, fornecedor ou sem cadastro ficam de
        fora. As faixas são pela receita de 12 meses: quem não pagou nada no período aparece na linha própria.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------- Tempo e área */

const SCOPE_OPTIONS: { key: OverdueScope; label: string }[] = [
  ...TIER_SCOPES,
  { key: NO_PAYMENT, label: NO_PAYMENT_LABEL },
];

function AgeAndAreaPanel({ debtors }: { debtors: IcpDebtor[] }) {
  const [scope, setScope] = useState<OverdueScope>("all");
  const list = debtorsInScope(debtors, scope);
  const total = list.reduce((acc, d) => acc + d.overdue, 0);
  const ages = overdueByAge(list);
  const areas = overdueByArea(list);
  const maxAge = Math.max(...ages.map((a) => a.value), 1);
  const maxArea = Math.max(...areas.map((a) => a.value), 1);
  const scopeLabel = SCOPE_OPTIONS.find((o) => o.key === scope)?.label ?? "";

  return (
    <Panel
      icon={CalendarClock}
      title="Tempo de atraso e áreas"
      description="Há quanto tempo o valor em aberto venceu e qual área emitiu a cobrança"
      info={INFO.envelhecimento}
      sources={[SRC.atraso, SRC.departamento]}
    >
      <SegmentedTabs options={SCOPE_OPTIONS} value={scope} onChange={setScope} label="Grupos considerados" className="mb-3" />
      <p className="mb-4 text-[13px] text-muted-foreground">
        {list.length ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">{money(total)}</span> em aberto de {list.length}{" "}
            {list.length === 1 ? "grupo" : "grupos"} ({scopeLabel.toLowerCase()}).
          </>
        ) : (
          "Nenhum grupo com atraso neste recorte."
        )}
      </p>
      {list.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <History className="size-4 text-muted-foreground" aria-hidden />
              Tempo desde o vencimento
            </h3>
            <div className="space-y-3">
              {ages.map((a) => (
                <BarRow
                  key={a.key}
                  label={a.label}
                  hint={`${a.groups} ${a.groups === 1 ? "grupo" : "grupos"}`}
                  value={a.value}
                  max={maxAge}
                  display={a.value > 0 ? `${money(a.value)} · ${pct(ratio(a.value, total))}` : "—"}
                  barClassName={AGING_TONE[a.key as IcpOverdueAgingKey]}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              Área que emitiu a cobrança
            </h3>
            <div className="space-y-3">
              {areas.map((a) => (
                <BarRow
                  key={a.key}
                  icon={a.key !== "Outros" ? <IcpAreaBadge area={a.key} size="sm" /> : <IcpAreaBadgeSpacer />}
                  label={a.label}
                  hint={`${a.groups} ${a.groups === 1 ? "grupo" : "grupos"}`}
                  value={a.value}
                  max={maxArea}
                  display={`${money(a.value)} · ${pct(ratio(a.value, total))}`}
                  barClassName={a.key === "Outros" ? "bg-neutral-300" : "bg-chart-5/70"}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- Quem deve */

type DebtorSortKey = "grupo" | "atraso" | "ratio" | "receita" | "antigo" | "mais1ano" | "pastas" | "horas";

const PREVIEW = 25;

const DEBTOR_FILTERS: { key: DebtorTier; label: string }[] = [
  { key: "A", label: "Faixa A" },
  { key: "B", label: "Faixa B" },
  { key: "C", label: "Faixa C" },
  { key: "D", label: "Faixa D" },
  { key: "E", label: "Faixa E" },
  { key: NO_PAYMENT, label: NO_PAYMENT_LABEL },
];

function DebtorsPanel({ data, debtors }: { data: IcpData; debtors: IcpDebtor[] }) {
  const today = data.windowEnd;
  const [query, setQuery] = useState("");
  const [tiers, setTiers] = useState<Set<DebtorTier>>(() => new Set(DEBTOR_FILTERS.map((f) => f.key)));
  const [sort, setSort] = useState<SortState<DebtorSortKey>>({ key: "atraso", desc: true });
  const [showAll, setShowAll] = useState(false);
  const onSort = (key: DebtorSortKey) => setSort((s) => nextSort(s, key));

  const q = query.trim().toLowerCase();
  const filtered = sortRows(
    debtors.filter((d) => tiers.has(d.tier) && (!q || d.grupo.toLowerCase().includes(q))),
    sort,
    (d, key) => {
      if (key === "grupo") return groupName(d.grupo);
      if (key === "atraso") return d.overdue;
      if (key === "ratio") return d.revenue12m > 0 ? d.overdue / d.revenue12m : null;
      if (key === "receita") return d.revenue12m > 0 ? d.revenue12m : null;
      if (key === "antigo") return d.oldestOverdue ? daysOverdue(d.oldestOverdue, today) : null;
      if (key === "mais1ano") return d.overdueAging.mais365 ?? 0;
      if (key === "pastas") return d.activeFolders;
      return d.hours12m;
    },
  );
  const collapsed = !q && !showAll && filtered.length > PREVIEW;
  const rows = collapsed ? filtered.slice(0, PREVIEW) : filtered;
  const filteredTotal = filtered.reduce((acc, d) => acc + d.overdue, 0);

  function toggleTier(key: DebtorTier) {
    setShowAll(false);
    setTiers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="min-w-0 rounded-(--radius-v2-xl) border border-border bg-white p-4 sm:p-5">
      <PanelHeader
        icon={Users}
        title="Quem deve"
        description="Cada grupo com honorário vencido em aberto, do maior atraso para o menor. Clique no título de uma coluna para ordenar."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo"
            className="h-9 pl-8"
            aria-label="Buscar grupo"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por faixa">
          {DEBTOR_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              active={tiers.has(f.key)}
              count={debtors.filter((d) => d.tier === f.key).length}
              onClick={() => toggleTier(f.key)}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "grupo" : "grupos"} · {money(filteredTotal)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadDebtorsCsv(filtered, today)}
            disabled={filtered.length === 0}
          >
            <Download aria-hidden />
            Baixar CSV
          </Button>
        </div>
      </div>

      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Grupo" sortKey="grupo" sort={sort} onSort={onSort} />
            <SortableHead label="Em atraso" sortKey="atraso" sort={sort} onSort={onSort} info={INFO.atrasoTotal} align="right" />
            <SortableHead
              label="Atraso ÷ receita"
              sortKey="ratio"
              sort={sort}
              onSort={onSort}
              info={INFO.atrasoReceitaGrupo}
            />
            <SortableHead label="Receita 12 meses" sortKey="receita" sort={sort} onSort={onSort} info={INFO.receita} align="right" />
            <SortableHead
              label="Vencimento mais antigo"
              sortKey="antigo"
              sort={sort}
              onSort={onSort}
              info={INFO.atrasoMaisAntigo}
            />
            <TableHead className={headClass}>Tempo de atraso</TableHead>
            <SortableHead
              label="Mais de 1 ano"
              sortKey="mais1ano"
              sort={sort}
              onSort={onSort}
              info={INFO.atrasoAntigo}
              align="right"
            />
            <TableHead className={headClass}>Áreas</TableHead>
            <SortableHead label="Pastas ativas" sortKey="pastas" sort={sort} onSort={onSort} info={INFO.pastasAtivas} align="right" />
            <SortableHead label="Horas" sortKey="horas" sort={sort} onSort={onSort} info={INFO.horas} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const days = d.oldestOverdue ? daysOverdue(d.oldestOverdue, today) : null;
            const areas = debtorAreas(d);
            return (
              <TableRow key={d.grupo}>
                <TableCell className="min-w-[240px] whitespace-normal py-3 align-top">
                  <div className="flex items-start gap-3">
                    <CompanyLogo group={d.group ?? { grupo: d.grupo, profile: null }} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={d.grupo}>
                        {groupName(d.grupo)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TierBadge tier={d.tier} size="sm" />
                        {d.tier === NO_PAYMENT ? "Não pagou nada em 12 meses" : `Faixa ${d.tier}`}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-right align-top font-semibold tabular-nums text-foreground">
                  {money(d.overdue)}
                </TableCell>
                <TableCell className="py-3 align-top">
                  {d.revenue12m > 0 ? (
                    <OverdueCell value={d.overdue / d.revenue12m} />
                  ) : (
                    <span className="text-xs text-muted-foreground">sem receita</span>
                  )}
                </TableCell>
                <TableCell className="py-3 text-right align-top tabular-nums">
                  {d.revenue12m > 0 ? money(d.revenue12m) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-3 align-top tabular-nums">
                  {d.oldestOverdue && days != null ? (
                    <>
                      <span className={cn(days > 365 && "font-semibold text-danger-text")}>{formatDate(d.oldestOverdue)}</span>
                      <span className="block text-xs text-muted-foreground">{overdueAgeLabel(days)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-3 align-top">
                  <AgingBar aging={d.overdueAging} className="mt-1.5" />
                </TableCell>
                <TableCell className="py-3 text-right align-top tabular-nums">
                  {(d.overdueAging.mais365 ?? 0) > 0 ? money(d.overdueAging.mais365 ?? 0) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-3 align-top">
                  {areas.length ? (
                    <div className="flex max-w-[150px] flex-wrap gap-1">
                      {areas.map(([area, value]) =>
                        area === "Outros" ? (
                          <span
                            key={area}
                            title={`Outros departamentos: ${money(value)}`}
                            className="inline-flex h-6 items-center rounded-(--radius-v2-sm) bg-neutral-100 px-1.5 text-xs font-medium text-muted-foreground"
                          >
                            Outros
                          </span>
                        ) : (
                          <span key={area} title={`${area}: ${money(value)}`}>
                            <IcpAreaBadge area={area} size="sm" />
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-3 text-right align-top tabular-nums">
                  {d.activeFolders > 0 ? d.activeFolders : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-3 text-right align-top tabular-nums">
                  {d.hours12m > 0 ? hoursLabel(d.hours12m) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                {q ? "Nenhum grupo com essa busca." : "Nenhum grupo com atraso nas faixas escolhidas."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <AgingLegend />
        {!q && filtered.length > PREVIEW && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-interactive-700 hover:bg-interactive-50"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", !collapsed && "rotate-180")} aria-hidden />
            {collapsed ? `Mostrar todos os ${filtered.length} grupos` : `Mostrar só os ${PREVIEW} primeiros`}
          </Button>
        )}
      </div>
    </section>
  );
}
