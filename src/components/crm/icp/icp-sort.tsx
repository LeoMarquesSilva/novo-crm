"use client";

/**
 * Ordenação das tabelas do ICP pelo cabeçalho: o primeiro clique numa coluna ordena do menor
 * para o maior (A→Z em texto), o segundo inverte. Linha sem valor fica sempre no fim.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { IcpInfoTooltip, focusRing } from "./icp-primitives";

export type SortState<K extends string> = { key: K; desc: boolean };

export type SortValue = number | string | null | undefined;

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return current.key === key ? { key, desc: !current.desc } : { key, desc: false };
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  valueOf: (row: T, key: K) => SortValue,
): T[] {
  return [...rows].sort((a, b) => {
    const va = valueOf(a, sort.key);
    const vb = valueOf(b, sort.key);
    const emptyA = va == null || (typeof va === "number" && !Number.isFinite(va));
    const emptyB = vb == null || (typeof vb === "number" && !Number.isFinite(vb));
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;
    const diff =
      typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "pt-BR") : Number(va) - Number(vb);
    return sort.desc ? -diff : diff;
  });
}

const headClass = "text-xs font-medium text-muted-foreground";

/** Cabeçalho de coluna que ordena ao clicar (com o "?" de ajuda opcional). */
export function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  info,
  align,
  className,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  info?: string;
  align?: "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const iconClass = cn("size-3", !active && "opacity-50");
  return (
    <TableHead
      className={cn(headClass, align === "right" && "text-right", className)}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <div className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 rounded-(--radius-v2-sm) text-left hover:text-foreground",
            focusRing,
            active && "text-foreground",
          )}
          title={active ? (sort.desc ? "Do maior para o menor" : "Do menor para o maior") : "Ordenar"}
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
