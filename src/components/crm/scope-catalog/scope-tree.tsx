"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { cn } from "@/lib/utils";
import type {
  ScopeTreeGroup,
  ScopeTreeItem,
  ScopeTreeSubtype,
} from "./scope-catalog-shell";

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
};

function isTypeSelected(selection: ScopeTreeSelection | null, typeId: string): boolean {
  return selection?.level === "type" && selection.typeId === typeId;
}

function isSubtypeSelected(selection: ScopeTreeSelection | null, subtypeId: string): boolean {
  return selection?.level === "subtype" && selection.subtypeId === subtypeId;
}

/** Cores por área de prática. */
function getAreaColors(area: string): { bg: string; text: string; ring: string } {
  const a = area.trim().toLowerCase();
  if (a.includes("cível") || a.includes("civel"))
    return { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" };
  if (a.includes("trabalh"))
    return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200" };
  if (a.includes("societ") || a.includes("contrat"))
    return { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" };
  if (a.includes("recupera") || a.includes("crédito") || a.includes("credito"))
    return { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" };
  if (a.includes("tribut"))
    return { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" };
  if (a.includes("reestrutura") || a.includes("insolvê") || a.includes("insolvencia"))
    return { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" };
  return { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200" };
}

export function ScopeTree({ groups, selection, onSelect, onCreateSubtype, emptyHint }: Props) {
  const [query, setQuery] = useState("");
  // Controle de quais L1/L2 estão expandidos. Por padrão, tudo aberto.
  const [openL1, setOpenL1] = useState<Set<string>>(() => new Set(groups.map((g) => g.key)));
  const [openL2, setOpenL2] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of groups) for (const i of g.items) initial.add(`${g.key}/${i.key}`);
    return initial;
  });

  const q = query.trim().toLowerCase();

  // Filtragem: mantém o nó se ele OU algum descendente match. Auto-expande os ancestrais.
  const filtered = useMemo(() => {
    if (!q) return groups;
    const out: ScopeTreeGroup[] = [];
    for (const g of groups) {
      const items: ScopeTreeItem[] = [];
      for (const it of g.items) {
        const subMatches = it.subtypes.filter((s) => s.label.toLowerCase().includes(q));
        const itMatches = it.label.toLowerCase().includes(q);
        const groupMatches = g.label.toLowerCase().includes(q);
        if (itMatches || subMatches.length > 0 || groupMatches) {
          items.push({
            ...it,
            subtypes: itMatches || groupMatches ? it.subtypes : subMatches,
          });
        }
      }
      if (items.length > 0 || g.label.toLowerCase().includes(q)) {
        out.push({ ...g, items });
      }
    }
    return out;
  }, [groups, q]);

  function toggleL1(key: string) {
    setOpenL1((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleL2(key: string) {
    setOpenL2((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isL1Open = (key: string) => Boolean(q) || openL1.has(key);
  const isL2Open = (key: string) => Boolean(q) || openL2.has(key);

  function handleSelectSubtype(s: ScopeTreeSubtype) {
    onSelect({
      level: "subtype",
      subtypeId: s.key,
      subtypeLabel: s.label,
      breadcrumb: [...s.parentBreadcrumb, s.label],
    });
  }

  function handleSelectType(it: ScopeTreeItem, group: ScopeTreeGroup) {
    const breadcrumb =
      group.key === "__all__" ? [it.label] : [group.label, it.label];
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
      <div className="shrink-0 border-b border-primary-dark/10 bg-white/60 p-3">
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
      </div>

      {/* Lista */}
      <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {q ? "Nenhum resultado." : emptyHint}
          </p>
        ) : (
          filtered.map((g) => {
            const AreaIcon = getAreaLucideIcon(g.label);
            const areaColors = getAreaColors(g.label);
            const totalSubtypes = g.items.reduce((acc, it) => acc + it.subtypes.length, 0);
            const isOpen = isL1Open(g.key);

            return (
              <div key={g.key} className="px-2 pb-1">
                {/* L1 — Área */}
                {filtered.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => toggleL1(g.key)}
                    className="group flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-primary-dark/5"
                  >
                    {/* Ícone colorido da área */}
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
                  <div className={cn(filtered.length > 1 && "ml-2 mt-0.5")}>
                    {g.items.map((it) => (
                      <div key={it.key} className="mb-0.5">
                        {/* L2 — Tipo */}
                        <div
                          className={cn(
                            "flex min-w-0 items-center gap-0.5 rounded-lg px-1 py-1 transition-colors",
                            it.isActive ? "" : "opacity-60",
                            isTypeSelected(selection, it.key)
                              ? "bg-primary-dark/8 ring-1 ring-primary-dark/15"
                              : "hover:bg-primary-dark/5",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleL2(`${g.key}/${it.key}`)}
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-primary-dark/50 hover:bg-primary-dark/8 hover:text-primary-dark"
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
                              "min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-xs font-semibold",
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
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-accent-teal/30 hover:bg-accent-teal hover:text-white"
                                aria-label={`Novo subtipo em ${it.label}`}
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* L3 — Subtipos */}
                        {isL2Open(`${g.key}/${it.key}`) && it.subtypes.length > 0 ? (
                          <ul className="mb-1 ml-4 space-y-px border-l-2 border-primary-dark/8 pl-2">
                            {it.subtypes.map((s) => {
                              const isSelected = isSubtypeSelected(selection, s.key);
                              return (
                                <li key={s.key}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSubtype(s)}
                                    title={s.label}
                                    className={cn(
                                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-all",
                                      isSelected
                                        ? "bg-accent-teal font-semibold text-white shadow-sm shadow-accent-teal/20"
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
