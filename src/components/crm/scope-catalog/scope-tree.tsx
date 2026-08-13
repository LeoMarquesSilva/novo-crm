"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAreaLucideIcon, getPracticeAreaColors } from "@/lib/crm/area-lucide-icon";
import { cn } from "@/lib/utils";
import {
  filterScopeTree,
  type ScopeTreeGroup,
  type ScopeTreeItem,
  type ScopeTreeSubtype,
} from "./scope-catalog-tree";

export type ScopeTreeSelection =
  | {
      level: "type";
      typeId: string;
      typeLabel: string;
      breadcrumb: string[];
    }
  | {
      level: "subtype";
      subtypeId: string;
      subtypeLabel: string;
      breadcrumb: string[];
    };

type Props = {
  groups: ScopeTreeGroup[];
  selection: ScopeTreeSelection | null;
  onSelect: (s: ScopeTreeSelection) => void;
  /** Callback ao clicar no "+" de um Tipo (L2) — gera subtipo dentro dele. */
  onCreateSubtype?: (typeId: string, typeLabel: string) => void;
  emptyHint: string;
  /** Quando definido (aba Escopos), restringe L1 às chaves listadas; vazio = todas. */
  areaFilterKeys?: string[] | null;
  /** Opções de área para chips de filtro (Escopos). */
  areaOptions?: string[];
  onAreaFilterChange?: (keys: string[]) => void;
  /** Recolhe L1 por defeito quando há mais grupos que este limite (default 3). */
  collapseL1Above?: number;
};

function isTypeSelected(selection: ScopeTreeSelection | null, typeId: string): boolean {
  return selection?.level === "type" && selection.typeId === typeId;
}

function isSubtypeSelected(selection: ScopeTreeSelection | null, subtypeId: string): boolean {
  return selection?.level === "subtype" && selection.subtypeId === subtypeId;
}

export function ScopeTree({
  groups,
  selection,
  onSelect,
  onCreateSubtype,
  emptyHint,
  areaFilterKeys,
  areaOptions,
  onAreaFilterChange,
  collapseL1Above = 3,
}: Props) {
  const [query, setQuery] = useState("");
  const [closedL1, setClosedL1] = useState<Set<string>>(() => new Set());
  const [closedL2, setClosedL2] = useState<Set<string>>(() => new Set());

  const q = query.trim().toLowerCase();
  const collapseThreshold = collapseL1Above;

  const l1Keys = useMemo(
    () => groups.filter((g) => !g.hideLabel).map((g) => g.key),
    [groups],
  );

  const collapseSignature = `${l1Keys.join("\0")}|${collapseThreshold}`;
  const [prevCollapseSignature, setPrevCollapseSignature] = useState<string | null>(null);
  if (prevCollapseSignature !== collapseSignature) {
    setPrevCollapseSignature(collapseSignature);
    if (l1Keys.length > collapseThreshold) {
      setClosedL1(new Set(l1Keys));
    } else {
      setClosedL1(new Set());
    }
    setClosedL2(new Set());
  }

  const areaFiltered = useMemo(() => {
    if (!areaFilterKeys || areaFilterKeys.length === 0) return groups;
    const keySet = new Set(areaFilterKeys);
    return groups.filter((g) => g.hideLabel || keySet.has(g.key));
  }, [groups, areaFilterKeys]);

  const filtered = useMemo(() => filterScopeTree(areaFiltered, query), [areaFiltered, query]);

  function toggleL1(key: string) {
    setClosedL1((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleL2(key: string) {
    setClosedL2((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isL1Open = (key: string) => Boolean(q) || !closedL1.has(key);
  const isL2Open = (key: string) => Boolean(q) || !closedL2.has(key);

  const showAreaFilter =
    areaOptions != null && areaOptions.length > 1 && onAreaFilterChange != null;
  const activeAreaFilter = areaFilterKeys ?? [];
  const allAreasSelected = activeAreaFilter.length === 0;

  function handleSelectSubtype(s: ScopeTreeSubtype) {
    onSelect({
      level: "subtype",
      subtypeId: s.key,
      subtypeLabel: s.label,
      breadcrumb: [...s.parentBreadcrumb, s.label],
    });
  }

  function handleSelectType(it: ScopeTreeItem, group: ScopeTreeGroup) {
    const breadcrumb = group.hideLabel ? [it.label] : [group.label, it.label];
    onSelect({
      level: "type",
      typeId: it.key,
      typeLabel: it.label,
      breadcrumb,
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Busca */}
      <div className="shrink-0 space-y-1.5 border-b border-primary-dark/10 bg-white p-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-9 border-primary-dark/15 bg-white pl-8 text-sm"
          />
        </div>

        {showAreaFilter ? (
          <div className="crm-scrollbar flex gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => onAreaFilterChange!([])}
              className={cn(
                "shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
                allAreasSelected
                  ? "bg-primary-dark text-white"
                  : "bg-primary-dark/8 text-primary-dark/70 hover:bg-primary-dark/12",
              )}
            >
              Todas
            </button>
            {areaOptions!.map((area) => {
              const selected = allAreasSelected || activeAreaFilter.includes(area);
              const colors = getPracticeAreaColors(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => {
                    if (allAreasSelected) {
                      onAreaFilterChange!([area]);
                      return;
                    }
                    const next = activeAreaFilter.includes(area)
                      ? activeAreaFilter.filter((k) => k !== area)
                      : [...activeAreaFilter, area];
                    onAreaFilterChange!(next.length === areaOptions!.length ? [] : next);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors",
                    selected
                      ? cn(colors.bg, colors.text, "ring-1", colors.ring)
                      : "bg-primary-dark/5 text-primary-dark/55 hover:bg-primary-dark/10",
                  )}
                >
                  {area}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Lista */}
      <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto py-1.5">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {q ? "Nenhum resultado." : emptyHint}
          </p>
        ) : (
          filtered.map((g) => {
            const showL1 = !g.hideLabel;
            const AreaIcon = getAreaLucideIcon(g.label);
            const areaColors = getPracticeAreaColors(g.label);
            const totalSubtypes = g.items.reduce((acc, it) => acc + it.subtypes.length, 0);
            const isOpen = showL1 ? isL1Open(g.key) : true;

            return (
              <div key={g.key} className="px-1.5 pb-0.5">
                {/* L1 — Área (omitido quando hideLabel, ex.: investimentos) */}
                {showL1 ? (
                  <button
                    type="button"
                    onClick={() => toggleL1(g.key)}
                    className="group flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-primary-dark/5"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-lg ring-1",
                        areaColors.bg,
                        areaColors.ring,
                      )}
                    >
                      <AreaIcon className={cn("size-3.5", areaColors.text)} aria-hidden />
                    </span>

                    <span className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[0.08em] text-primary-dark">
                      {g.label}
                    </span>

                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                        areaColors.bg,
                        areaColors.text,
                      )}
                    >
                      {totalSubtypes}
                    </span>

                    {isOpen ? (
                      <ChevronDown className="size-3 shrink-0 text-primary-dark/40" aria-hidden />
                    ) : (
                      <ChevronRight className="size-3 shrink-0 text-primary-dark/40" aria-hidden />
                    )}
                  </button>
                ) : null}

                {isOpen ? (
                  <div className={cn(showL1 && "ml-1.5 mt-px")}>
                    {g.items.map((it) => (
                      <div key={it.key} className="mb-px">
                        {/* L2 — Tipo */}
                        <div
                          className={cn(
                            "flex min-w-0 items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-colors",
                            it.isActive ? "" : "opacity-60",
                            isTypeSelected(selection, it.key)
                              ? "border-l-2 border-primary-dark bg-primary-dark/10 pl-0.5"
                              : "hover:bg-primary-dark/5",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleL2(`${g.key}/${it.key}`)}
                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-primary-dark/50 hover:bg-primary-dark/8 hover:text-primary-dark"
                            aria-label={isL2Open(`${g.key}/${it.key}`) ? "Recolher" : "Expandir"}
                          >
                            {isL2Open(`${g.key}/${it.key}`) ? (
                              <ChevronDown className="size-3.5" aria-hidden />
                            ) : (
                              <ChevronRight className="size-3.5" aria-hidden />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectType(it, g)}
                            title={it.label}
                            className={cn(
                              "min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left text-xs font-semibold",
                              it.isActive ? "text-primary-dark" : "text-muted-foreground",
                              isTypeSelected(selection, it.key) && "text-primary-dark",
                            )}
                          >
                            {it.label}
                          </button>

                          <div className="flex shrink-0 items-center gap-0.5 pl-0.5">
                            <span className="rounded bg-primary-dark/8 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-primary-dark/60">
                              {it.subtypes.length}
                            </span>

                            {onCreateSubtype ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCreateSubtype(it.key, it.label);
                                }}
                                title={`Novo subtipo em ${it.label}`}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-accent-teal/30 hover:bg-accent-teal hover:text-white"
                                aria-label={`Novo subtipo em ${it.label}`}
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* L3 — Subtipos */}
                        {isL2Open(`${g.key}/${it.key}`) && it.subtypes.length > 0 ? (
                          <ul className="mb-0.5 ml-3 space-y-px border-l-2 border-primary-dark/10 pl-1.5">
                            {it.subtypes.map((s) => {
                              const isSelected = isSubtypeSelected(selection, s.key);
                              return (
                                <li key={s.key}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSubtype(s)}
                                    title={s.label}
                                    className={cn(
                                      "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors",
                                      isSelected
                                        ? "border-l-2 border-accent-teal bg-accent-teal font-semibold text-white shadow-sm"
                                        : s.isActive
                                          ? "text-slate-700 hover:bg-primary-dark/5"
                                          : "text-slate-400 hover:bg-slate-100/60",
                                    )}
                                  >
                                    <span className="min-w-0 flex-1 truncate leading-snug">{s.label}</span>
                                    {!s.isActive ? (
                                      <span
                                        className={cn(
                                          "shrink-0 rounded px-1 py-px text-[8px] font-black uppercase tracking-wide",
                                          isSelected
                                            ? "bg-white/20 text-white/80"
                                            : "bg-slate-200 text-slate-500",
                                        )}
                                      >
                                        off
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
