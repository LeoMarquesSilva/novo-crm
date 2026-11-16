/**
 * Cálculos de tela da aba Inadimplência: junta quem paga (faixas A a E) e quem deve sem ter
 * pago nada em 12 meses numa lista só de devedores, e resume por faixa, tempo e área.
 * Funções puras; o envelhecimento por grupo vem de `@/modules/icp/domain/compute`.
 */
import {
  OVERDUE_AGING,
  daysOverdue,
  overdueAgingTotals,
  type IcpData,
  type IcpGroupRow,
  type IcpOverdueAging,
  type IcpOverdueAgingKey,
  type IcpTierKey,
} from "@/modules/icp/domain/compute";
import { csvCell } from "./icp-clients-csv";
import type { TierScope } from "./icp-content";
import { groupName } from "./icp-format";

/** Linha dos grupos que devem e não pagaram nada em 12 meses (fora das faixas). */
export const NO_PAYMENT = "sem" as const;

export type DebtorTier = IcpTierKey | typeof NO_PAYMENT;

/** Recorte da aba: os mesmos da tela (escritório, ICP, faixas) mais quem não pagou em 12 meses. */
export type OverdueScope = TierScope | typeof NO_PAYMENT;

export const NO_PAYMENT_LABEL = "Sem pagamento em 12 meses";

export interface IcpDebtor {
  grupo: string;
  tier: DebtorTier;
  /** Linha completa do grupo nas faixas; null para quem não pagou em 12 meses. */
  group: IcpGroupRow | null;
  overdue: number;
  revenue12m: number;
  overdueByArea: Record<string, number>;
  overdueAging: IcpOverdueAging;
  oldestOverdue: string | null;
  activeFolders: number;
  hours12m: number;
}

/** Todos os grupos com honorário vencido em aberto, do maior atraso para o menor. */
export function debtorsOf(data: IcpData): IcpDebtor[] {
  const paying: IcpDebtor[] = data.groups
    .filter((g) => g.overdue > 0)
    .map((g) => ({
      grupo: g.grupo,
      tier: g.tier,
      group: g,
      overdue: g.overdue,
      revenue12m: g.revenue12m,
      overdueByArea: Object.fromEntries(
        Object.entries(g.byArea)
          .filter(([, m]) => m.overdue > 0)
          .map(([area, m]) => [area, m.overdue]),
      ),
      overdueAging: g.overdueAging,
      oldestOverdue: g.oldestOverdue,
      activeFolders: g.activeFolders,
      hours12m: g.hours12m,
    }));
  const outside: IcpDebtor[] = (data.overdueOutside ?? []).map((o) => ({
    ...o,
    tier: NO_PAYMENT,
    group: null,
    revenue12m: 0,
  }));
  return [...paying, ...outside].sort((a, b) => b.overdue - a.overdue);
}

export function debtorsInScope(debtors: IcpDebtor[], scope: OverdueScope): IcpDebtor[] {
  if (scope === "all") return debtors;
  if (scope === "core") return debtors.filter((d) => d.tier === "A" || d.tier === "B");
  return debtors.filter((d) => d.tier === scope);
}

const sumOverdue = (list: IcpDebtor[]) => list.reduce((acc, d) => acc + d.overdue, 0);

export interface IcpOverdueTierRow {
  key: DebtorTier;
  /** "R$ 200 mil+" ou "não pagaram nada em 12 meses". */
  range: string;
  /** Grupos da faixa (pagantes); para quem não pagou, o próprio número de devedores. */
  groups: number;
  debtors: number;
  overdue: number;
  /** Receita de 12 meses da faixa; null para quem não pagou. */
  revenue: number | null;
  /** Parte de todo o atraso do escritório. */
  share: number;
  /** Atraso ÷ receita de 12 meses; null sem receita. */
  ratio: number | null;
  /** Atraso ÷ grupos que devem. */
  avgPerDebtor: number | null;
  aging: Record<IcpOverdueAgingKey, number>;
}

function tierRow(
  key: DebtorTier,
  range: string,
  groups: number,
  revenue: number | null,
  list: IcpDebtor[],
  total: number,
): IcpOverdueTierRow {
  const overdue = sumOverdue(list);
  return {
    key,
    range,
    groups,
    debtors: list.length,
    overdue,
    revenue,
    share: total > 0 ? overdue / total : 0,
    ratio: revenue && revenue > 0 ? overdue / revenue : null,
    avgPerDebtor: list.length ? overdue / list.length : null,
    aging: overdueAgingTotals(list),
  };
}

/** Uma linha por faixa (A a E) e, no fim, a de quem não pagou nada em 12 meses. */
export function overdueByTier(data: IcpData, debtors: IcpDebtor[]): IcpOverdueTierRow[] {
  const total = sumOverdue(debtors);
  const rows = data.tiers.map((t) =>
    tierRow(
      t.key,
      t.range,
      t.groups,
      t.revenue,
      debtors.filter((d) => d.tier === t.key),
      total,
    ),
  );
  const outside = debtors.filter((d) => d.tier === NO_PAYMENT);
  return [...rows, tierRow(NO_PAYMENT, "não pagaram nada em 12 meses", outside.length, null, outside, total)];
}

/** Soma de várias linhas (pagantes, escritório todo); a chave e o rótulo ficam com a tela. */
export function overdueTotalRow(rows: IcpOverdueTierRow[], total: number): Omit<IcpOverdueTierRow, "key" | "range"> {
  const overdue = rows.reduce((acc, r) => acc + r.overdue, 0);
  const debtors = rows.reduce((acc, r) => acc + r.debtors, 0);
  const revenues = rows.map((r) => r.revenue).filter((v): v is number => v != null);
  const revenue = revenues.length ? revenues.reduce((acc, v) => acc + v, 0) : null;
  const aging = Object.fromEntries(
    OVERDUE_AGING.map((a) => [a.key, rows.reduce((acc, r) => acc + r.aging[a.key], 0)]),
  ) as Record<IcpOverdueAgingKey, number>;
  return {
    groups: rows.reduce((acc, r) => acc + r.groups, 0),
    debtors,
    overdue,
    revenue,
    share: total > 0 ? overdue / total : 0,
    ratio: revenue && revenue > 0 ? overdue / revenue : null,
    avgPerDebtor: debtors ? overdue / debtors : null,
    aging,
  };
}

export interface IcpOverdueBucket {
  key: string;
  label: string;
  value: number;
  /** Grupos com algum valor neste recorte. */
  groups: number;
}

/** Valor em aberto por tempo desde o vencimento (todas as faixas de tempo, mesmo zeradas). */
export function overdueByAge(debtors: IcpDebtor[]): IcpOverdueBucket[] {
  const totals = overdueAgingTotals(debtors);
  return OVERDUE_AGING.map((a) => ({
    key: a.key,
    label: a.label,
    value: totals[a.key],
    groups: debtors.filter((d) => (d.overdueAging[a.key] ?? 0) > 0).length,
  }));
}

/** Valor em aberto por área que faturou, do maior para o menor ("Outros" no fim). */
export function overdueByArea(debtors: IcpDebtor[]): IcpOverdueBucket[] {
  const byArea = new Map<string, { value: number; groups: number }>();
  for (const d of debtors) {
    for (const [area, value] of Object.entries(d.overdueByArea)) {
      if (value <= 0) continue;
      const entry = byArea.get(area) ?? { value: 0, groups: 0 };
      entry.value += value;
      entry.groups += 1;
      byArea.set(area, entry);
    }
  }
  return [...byArea.entries()]
    .map(([area, e]) => ({ key: area, label: area, value: e.value, groups: e.groups }))
    .sort((a, b) => (a.key === "Outros" ? 1 : b.key === "Outros" ? -1 : b.value - a.value));
}

/** Áreas do devedor com o valor em aberto de cada uma, da maior para a menor. */
export function debtorAreas(d: IcpDebtor): [string, number][] {
  return Object.entries(d.overdueByArea)
    .filter(([, v]) => v > 0)
    .sort((a, b) => (a[0] === "Outros" ? 1 : b[0] === "Outros" ? -1 : b[1] - a[1]));
}

/** "há 12 dias", "há 5 meses", "há mais de 2 anos". */
export function overdueAgeLabel(days: number): string {
  if (days < 60) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  const years = Math.floor(days / 365);
  return `há mais de ${years} ${years === 1 ? "ano" : "anos"}`;
}

/* -------------------------------------------------------------------------- CSV */

export const ICP_DEBTORS_CSV_HEADER = [
  "Faixa",
  "Grupo",
  "Em atraso",
  "Receita 12 meses",
  "Atraso ÷ receita (%)",
  "Vencimento mais antigo",
  "Dias desde o vencimento mais antigo",
  ...OVERDUE_AGING.map((a) => a.label),
  "Áreas em atraso",
  "Pastas ativas",
  "Horas 12 meses",
] as const;

/** CSV (com BOM, separador ";") dos devedores, na ordem recebida. `today` é a data do cálculo. */
export function buildDebtorsCsv(rows: IcpDebtor[], today: string): string {
  const lines = rows.map((d) =>
    [
      d.tier === NO_PAYMENT ? NO_PAYMENT_LABEL : d.tier,
      groupName(d.grupo),
      Math.round(d.overdue),
      d.revenue12m > 0 ? Math.round(d.revenue12m) : null,
      d.revenue12m > 0 ? Math.round((d.overdue / d.revenue12m) * 100) : null,
      d.oldestOverdue ? d.oldestOverdue.split("-").reverse().join("/") : null,
      d.oldestOverdue ? daysOverdue(d.oldestOverdue, today) : null,
      ...OVERDUE_AGING.map((a) => Math.round(d.overdueAging[a.key] ?? 0)),
      debtorAreas(d)
        .map(([area, value]) => `${area} (${Math.round(value)})`)
        .join(", "),
      d.activeFolders,
      Math.round(d.hours12m),
    ]
      .map(csvCell)
      .join(";"),
  );
  return "﻿" + [ICP_DEBTORS_CSV_HEADER.join(";"), ...lines].join("\r\n");
}

/** Baixa a lista filtrada de devedores em CSV. */
export function downloadDebtorsCsv(rows: IcpDebtor[], today: string): void {
  const blob = new Blob([buildDebtorsCsv(rows, today)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `icp-inadimplencia-${today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
