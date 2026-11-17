import { BR_TIMEZONE } from "@/lib/format-datetime";

/** Períodos do filtro do Dashboard comercial (dias corridos até agora). */
export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 30;

export function parseDashboardPeriod(value: string | string[] | undefined): DashboardPeriod {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (DASHBOARD_PERIODS as readonly number[]).includes(n) ? (n as DashboardPeriod) : DEFAULT_DASHBOARD_PERIOD;
}

export interface PeriodWindow {
  /** Início do período atual (inclusive). */
  inicio: Date;
  /** Início do período anterior, de mesmo tamanho (inclusive); termina em `inicio`. */
  inicioAnterior: Date;
}

export function periodWindow(dias: DashboardPeriod, agora: Date = new Date()): PeriodWindow {
  const ms = dias * 24 * 60 * 60 * 1000;
  return { inicio: new Date(agora.getTime() - ms), inicioAnterior: new Date(agora.getTime() - 2 * ms) };
}

export interface PeriodDelta {
  /** Entradas no período atual. */
  atual: number;
  /** Entradas no período anterior, de mesmo tamanho. */
  anterior: number;
  /** Variação percentual das entradas; `null` quando o período anterior não teve nenhuma. */
  variacaoPct: number | null;
}

export function periodDelta(atual: number, anterior: number): PeriodDelta {
  return {
    atual,
    anterior,
    variacaoPct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null,
  };
}

/** Conta datas ISO no período atual e no anterior. */
export function countInWindows(datesIso: Iterable<string | null | undefined>, janela: PeriodWindow): PeriodDelta {
  let atual = 0;
  let anterior = 0;
  const inicio = janela.inicio.getTime();
  const inicioAnterior = janela.inicioAnterior.getTime();
  for (const iso of datesIso) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= inicio) atual += 1;
    else if (t >= inicioAnterior) anterior += 1;
  }
  return periodDelta(atual, anterior);
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pelo horário de Brasília. */
export function saudacaoBr(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: BR_TIMEZONE }).format(agora),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}
