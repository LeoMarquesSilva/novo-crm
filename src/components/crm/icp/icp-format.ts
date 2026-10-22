/**
 * Formatadores e pequenos cálculos de tela do ICP. Funções puras: a regra de negócio
 * (faixas, buckets, segmentos) fica em `@/modules/icp/domain/compute`.
 */
import type { IcpCount, IcpData, IcpGroupRow } from "@/modules/icp/domain/compute";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 1,2 mi", "R$ 45 mil", "R$ 2,5 mil" ou "R$ 800". */
export function money(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (value >= 10_000) return `R$ ${Math.round(value / 1_000).toLocaleString("pt-BR")} mil`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl.format(value);
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Valor em reais ou "—" quando não há (ex.: receita por hora sem horas lançadas). */
export function moneyOrDash(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : money(value);
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

/** Número com até uma casa decimal ("1,5"). */
export function decimal(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function hoursLabel(value: number): string {
  return `${Math.round(value).toLocaleString("pt-BR")} h`;
}

export function ratio(value: number, base: number): number | null {
  return base > 0 ? value / base : null;
}

/** Margem só faz sentido quando houve horas apontadas para o cliente. */
export function marginOf(revenue: number, cost: number, hours: number): number | null {
  return hours > 0 && revenue > 0 ? (revenue - cost) / revenue : null;
}

export function predominant(values: (string | null)[]): { label: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [label, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return label ? { label, count: count! } : null;
}

export function countOf(list: IcpCount[], label: string): number {
  return list.find((c) => c.label === label)?.count ?? 0;
}

/** "2025-10-01" → "out 25". */
export function monthLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

/** Data ISO (com ou sem hora) → "dd/mm/aaaa". */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

export function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** "Grupo Alfa" → "Alfa". */
export const groupName = (grupo: string) => grupo.replace(/^grupo\s+/i, "");

/** "51-200" → "51 a 200"; "10.001+" → "10.001 ou mais". */
export function employeeRangeText(range: string): string {
  return range.replace("-", " a ").replace(/\+$/, " ou mais");
}

export const entryAreaLabel = (area: string) => (/insolv/i.test(area) ? "Insolvência" : area);

export const isCapitalCity = (city: string | null) => /^s[ãa]o paulo$/i.test((city ?? "").trim());

/** Explica a receita deixada fora do ICP por não ser de cliente. */
export function excludedRevenueNote(data: IcpData): string {
  const { excludedPayers, excludedRevenue } = data.totals;
  if (!excludedPayers) return "";
  return `Não inclui ${money(excludedRevenue)} pagos por ${excludedPayers} pagadores que não são clientes no VIOS (parte contrária, fornecedor ou sem cadastro), em geral honorários de sucumbência e de êxito.`;
}

/** Por que o grupo não tem segmento: cliente pessoa física (sem CNPJ) ou empresa sem CNPJ no VIOS. */
export function noSectorLabel(clientType: IcpGroupRow["clientType"]): string {
  if (clientType === "pessoa_fisica") return "Pessoa física";
  if (clientType === "pessoa_juridica") return "Empresa sem CNPJ no VIOS";
  return "Sem cadastro no VIOS";
}
