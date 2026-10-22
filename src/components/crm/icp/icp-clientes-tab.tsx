"use client";

/** Aba Clientes: lista de grupos com filtros por faixa e porte, busca, ordenação, detalhe e CSV. */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, Download, Globe, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  EMPLOYEE_BANDS,
  type IcpData,
  type IcpEmployeeBand,
  type IcpGroupRow,
  type IcpTierKey,
} from "@/modules/icp/domain/compute";
import { IcpAreaBadge } from "./icp-area-icon";
import { sortedPlans } from "@/modules/icp/domain/plano-contas";
import { PlanDot } from "./icp-plano-contas";
import { downloadClientsCsv } from "./icp-clients-csv";
import { INFO, SRC, TIER_TONE } from "./icp-content";
import { employeeRangeText, entryAreaLabel, formatCnpj, formatDate, groupName, money, noSectorLabel } from "./icp-format";
import {
  CompanyLogo,
  EmployeeRange,
  FilterChip,
  IcpInfoTooltip,
  LabelWithInfo,
  LinkedinIcon,
  Panel,
  focusRing,
} from "./icp-primitives";

type ClientSortKey = "name" | "employees" | "folders" | "monthly" | "overdue";
type ClientSort = { key: ClientSortKey; desc: boolean };
type BandFilter = IcpEmployeeBand | "sem";

const BAND_FILTERS: { key: BandFilter; label: string }[] = [
  ...EMPLOYEE_BANDS.map((b) => ({ key: b.key as BandFilter, label: b.label })),
  { key: "sem", label: "Sem porte" },
];

const MAX_AREA_ICONS = 4;

function sortValue(g: IcpGroupRow, key: ClientSortKey): number | string | null {
  if (key === "name") return groupName(g.grupo).toLowerCase();
  if (key === "employees") return g.profile?.employeeMin ?? g.profile?.linkedinMembers ?? null;
  if (key === "folders") return g.activeFolders;
  if (key === "monthly") return g.monthly;
  return g.overdue;
}

function toggle<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

const bandOf = (g: IcpGroupRow): BandFilter => g.employeeBand ?? "sem";

const headClass = "text-xs font-medium text-muted-foreground";

export function ClientesTab({ data }: { data: IcpData }) {
  const [query, setQuery] = useState("");
  const [tiers, setTiers] = useState<Set<IcpTierKey>>(() => new Set<IcpTierKey>(["A", "B"]));
  const [bands, setBands] = useState<Set<BandFilter>>(() => new Set<BandFilter>());
  const [sort, setSort] = useState<ClientSort>({ key: "monthly", desc: true });
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const inTiers = useMemo(() => data.groups.filter((g) => tiers.has(g.tier)), [data.groups, tiers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = inTiers.filter(
      (g) =>
        (bands.size === 0 || bands.has(bandOf(g))) &&
        (!q ||
          g.grupo.toLowerCase().includes(q) ||
          (g.sector ?? "").toLowerCase().includes(q) ||
          (g.sectorBucket ?? "").toLowerCase().includes(q) ||
          (g.referenceCompany?.razaoSocial ?? "").toLowerCase().includes(q) ||
          (g.profile?.linkedinName ?? "").toLowerCase().includes(q) ||
          (g.city ?? "").toLowerCase().includes(q)),
    );
    // Sem valor (porte desconhecido) fica sempre no fim, nos dois sentidos.
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const diff = typeof va === "string" ? va.localeCompare(vb as string, "pt-BR") : va - (vb as number);
      return sort.desc ? -diff : diff;
    });
  }, [inTiers, bands, query, sort]);

  function sortBy(key: ClientSortKey) {
    setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: key !== "name" }));
  }

  return (
    <Panel
      icon={Building2}
      title="Grupos de clientes"
      description="Use os grupos A e B como modelo de prospecção e como cases. Clique num grupo para ver os detalhes."
      sources={[SRC.honorarios, SRC.departamento, SRC.processos, SRC.pessoas, SRC.atraso, SRC.cnae, SRC.sede, SRC.socios, SRC.colaboradores]}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="icp-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo, setor ou cidade"
            className="h-9 pl-8"
            aria-label="Buscar grupo, setor ou cidade"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por faixa de receita">
          {data.tiers.map((t) => (
            <FilterChip
              key={t.key}
              active={tiers.has(t.key)}
              count={t.groups}
              onClick={() => setTiers((prev) => toggle(prev, t.key))}
            >
              Faixa {t.key}
            </FilterChip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {rows.length} {rows.length === 1 ? "grupo" : "grupos"}
          </p>
          <Button variant="outline" size="sm" onClick={() => downloadClientsCsv(rows)} disabled={rows.length === 0}>
            <Download aria-hidden />
            Baixar CSV
          </Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por colaboradores">
        <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          Colaboradores
        </span>
        <FilterChip active={bands.size === 0} onClick={() => setBands(new Set())}>
          Todos
        </FilterChip>
        {BAND_FILTERS.map((b) => {
          const count = inTiers.filter((g) => bandOf(g) === b.key).length;
          return (
            <FilterChip
              key={b.key}
              active={bands.has(b.key)}
              count={count}
              disabled={count === 0 && !bands.has(b.key)}
              onClick={() => setBands((prev) => toggle(prev, b.key))}
            >
              {b.label}
            </FilterChip>
          );
        })}
      </div>

      <Table className="min-w-[1020px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHeader label="Grupo" sortKey="name" sort={sort} onSort={sortBy} />
            <TableHead className={headClass}>
              <LabelWithInfo label="Segmento" info={INFO.segmento} />
            </TableHead>
            <SortHeader label="Colaboradores" sortKey="employees" sort={sort} onSort={sortBy} info={INFO.colaboradores} />
            <TableHead className={headClass}>Sede</TableHead>
            <TableHead className={headClass}>
              <LabelWithInfo label="Áreas" info={INFO.areasGrupo} />
            </TableHead>
            <SortHeader label="Pastas ativas" sortKey="folders" sort={sort} onSort={sortBy} info={INFO.pastasAtivas} align="right" />
            <SortHeader label="Média mensal" sortKey="monthly" sort={sort} onSort={sortBy} info={INFO.mediaMensal} align="right" />
            <SortHeader label="Em atraso" sortKey="overdue" sort={sort} onSort={sortBy} info={INFO.atrasoGrupo} align="right" />
            <TableHead className="w-8">
              <span className="sr-only">Detalhes</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => (
            <GroupRow
              key={g.grupo}
              group={g}
              open={openGroup === g.grupo}
              onToggle={() => setOpenGroup((prev) => (prev === g.grupo ? null : g.grupo))}
            />
          ))}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum grupo com esses filtros.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  info,
  align,
}: {
  label: string;
  sortKey: ClientSortKey;
  sort: ClientSort;
  onSort: (key: ClientSortKey) => void;
  info?: string;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  const iconClass = cn("size-3", !active && "opacity-50");
  return (
    <TableHead
      className={cn(headClass, align === "right" && "text-right")}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <div className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 rounded-(--radius-v2-sm) hover:text-foreground",
            focusRing,
            active && "text-foreground",
          )}
        >
          {label}
          {!active ? (
            <ArrowUpDown className={iconClass} aria-hidden />
          ) : sort.desc ? (
            <ArrowDown className={iconClass} aria-hidden />
          ) : (
            <ArrowUp className={iconClass} aria-hidden />
          )}
        </button>
        {info && <IcpInfoTooltip title={label} description={info} />}
      </div>
    </TableHead>
  );
}

function GroupRow({ group: g, open, onToggle }: { group: IcpGroupRow; open: boolean; onToggle: () => void }) {
  const extraAreas = g.areas.length - MAX_AREA_ICONS;
  const heavyOverdue = g.overdue > g.revenue12m * 0.5;
  return (
    <Fragment>
      <TableRow className={cn("cursor-pointer", open && "border-b-0 bg-surface-subtle")} onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                TIER_TONE[g.tier].badge,
              )}
              title={`Faixa ${g.tier}`}
            >
              {g.tier}
            </span>
            <CompanyLogo group={g} size="sm" />
            <button
              type="button"
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={cn("truncate rounded-(--radius-v2-sm) text-left font-medium text-foreground", focusRing)}
            >
              {groupName(g.grupo)}
            </button>
            {g.hasRetainer && (
              <Badge variant="outline" className="border-info-border bg-info-bg text-info-text">
                mensal
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="max-w-[200px] truncate text-muted-foreground" title={g.sector ?? undefined}>
          {g.sectorBucket ?? noSectorLabel(g.clientType)}
        </TableCell>
        <TableCell>
          <EmployeeRange group={g} />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {g.city ? `${g.city}${g.uf ? ` · ${g.uf}` : ""}` : (g.uf ?? "—")}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {g.areas.slice(0, MAX_AREA_ICONS).map((a) => (
              <IcpAreaBadge key={a} area={a} size="sm" />
            ))}
            {extraAreas > 0 && (
              <span
                className="inline-flex h-6 items-center rounded-(--radius-v2-sm) bg-neutral-100 px-1.5 text-xs font-medium tabular-nums text-muted-foreground"
                title={g.areas.slice(MAX_AREA_ICONS).join(", ")}
              >
                +{extraAreas}
              </span>
            )}
            {g.areas.length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-foreground">{g.activeFolders > 0 ? g.activeFolders : "—"}</TableCell>
        <TableCell className="text-right font-semibold tabular-nums text-foreground">{money(g.monthly)}</TableCell>
        <TableCell
          className={cn("text-right tabular-nums", heavyOverdue ? "font-medium text-warning-text" : "text-muted-foreground")}
        >
          {g.overdue > 0 ? money(g.overdue) : "—"}
        </TableCell>
        <TableCell className="pl-2 text-muted-foreground">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
          <TableCell colSpan={9} className="whitespace-normal px-3 pb-4 pt-1">
            <GroupDetail group={g} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-(--radius-v2-lg) border border-border bg-white p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

const detailLinkClass = cn(
  "flex w-fit max-w-full items-center gap-1 truncate rounded-(--radius-v2-sm) text-interactive-700 underline-offset-2 hover:underline",
  focusRing,
);

/** Tudo o que se sabe do grupo: empresa, porte, quem decide, relação com o escritório e números de 12 meses. */
function GroupDetail({ group: g }: { group: IcpGroupRow }) {
  const ref = g.referenceCompany;
  const profile = g.profile;
  const site = profile?.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const areaRevenue = Object.entries(g.byArea)
    .filter(([area, m]) => area !== "Outros" && m.revenue > 0)
    .sort((a, b) => b[1].revenue - a[1].revenue);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DetailBlock title="Empresa">
        <div className="flex items-start gap-3">
          <CompanyLogo group={g} />
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="font-medium leading-snug text-foreground">{ref?.razaoSocial ?? groupName(g.grupo)}</p>
            {ref && <p className="text-xs tabular-nums text-muted-foreground">CNPJ {formatCnpj(ref.cnpj)}</p>}
            {g.sector && <p className="text-xs leading-snug text-muted-foreground">{g.sector}</p>}
          </div>
        </div>
        <div className="mt-3 space-y-1 text-xs">
          {profile?.linkedinUrl && (
            <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className={detailLinkClass}>
              <LinkedinIcon className="size-3.5 shrink-0" />
              {profile.linkedinName ?? "Página no LinkedIn"}
              {profile.employeeRange && (
                <span className="text-muted-foreground"> · {employeeRangeText(profile.employeeRange)}</span>
              )}
            </a>
          )}
          {profile?.website && site && (
            <a href={profile.website} target="_blank" rel="noreferrer" className={detailLinkClass}>
              <Globe className="size-3.5 shrink-0" aria-hidden />
              {site}
            </a>
          )}
          {!profile?.linkedinUrl && !site && <p className="text-muted-foreground">Sem página no LinkedIn nem site.</p>}
        </div>
      </DetailBlock>

      <DetailBlock title="Sócios administradores">
        {g.decisionMakers.length ? (
          <ul className="space-y-1 text-sm text-foreground">
            {g.decisionMakers.slice(0, 6).map((d) => (
              <li key={d.nome} className="leading-snug">
                {d.nome}
                {d.qualificacao && <span className="block text-xs text-muted-foreground">{d.qualificacao}</span>}
              </li>
            ))}
            {g.decisionMakers.length > 6 && (
              <li className="text-xs text-muted-foreground">e mais {g.decisionMakers.length - 6}</li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ref ? "Sem sócio com poder de administração no QSA." : "Sem empresa consultada na Receita."}
          </p>
        )}
      </DetailBlock>

      <DetailBlock title="Relação com o escritório">
        <div className="space-y-2 text-sm text-foreground">
          <p>
            <span className="text-muted-foreground">Entrada: </span>
            {g.entryArea ? entryAreaLabel(g.entryArea) : "—"}
            {g.firstProcess && <span className="text-muted-foreground"> · {formatDate(g.firstProcess)}</span>}
          </p>
          <div>
            <p className="text-muted-foreground">Tipo de contrato (plano de contas):</p>
            <ul className="mt-1 space-y-1">
              {sortedPlans(g.revenueByPlan).map(([plan, value]) => (
                <li key={plan} className="flex items-center gap-2 text-xs">
                  <PlanDot plan={plan} />
                  <span className="min-w-0 flex-1 truncate">{plan}</span>
                  <span className="tabular-nums text-muted-foreground">{money(value)}</span>
                </li>
              ))}
            </ul>
          </div>
          {areaRevenue.length > 0 && (
            <ul className="space-y-1 pt-1">
              {areaRevenue.map(([area, m]) => (
                <li key={area} className="flex items-center gap-2 text-xs">
                  <IcpAreaBadge area={area} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{area}</span>
                  <span className="tabular-nums text-muted-foreground">{money(m.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailBlock>

      <DetailBlock title="Últimos 12 meses">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Receita</dt>
            <dd className="font-semibold tabular-nums text-foreground">{money(g.revenue12m)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Média mensal</dt>
            <dd className="font-semibold tabular-nums text-foreground">{money(g.monthly)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Horas</dt>
            <dd className="tabular-nums text-foreground">{Math.round(g.hours12m).toLocaleString("pt-BR")} h</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pastas ativas hoje</dt>
            <dd className="tabular-nums text-foreground">{g.activeFolders}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Em atraso</dt>
            <dd className={cn("tabular-nums text-foreground", g.overdue > g.revenue12m * 0.5 && "font-medium text-warning-text")}>
              {g.overdue > 0 ? money(g.overdue) : "—"}
            </dd>
          </div>
        </dl>
      </DetailBlock>
    </div>
  );
}
