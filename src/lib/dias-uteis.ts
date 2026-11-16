/**
 * Dias úteis pelo calendário de feriados nacionais da ANBIMA (o que o mercado financeiro usa). Desde 16/11/2026
 * todo cálculo de dia útil do CRM passa por aqui; antes só sábado e domingo eram pulados e o CRM aceitava, por
 * exemplo, 20/11 (Consciência Negra) como dia útil.
 *
 * Feriados ANBIMA: Confraternização Universal (1/1), Carnaval (segunda e terça), Paixão de Cristo (sexta-feira
 * santa), Tiradentes (21/4), Dia do Trabalho (1/5), Corpus Christi, Independência (7/9), Nossa Senhora Aparecida
 * (12/10), Finados (2/11), Proclamação da República (15/11), Dia Nacional de Zumbi e da Consciência Negra (20/11,
 * desde 2024, Lei 14.759/2023) e Natal (25/12). Os móveis saem da Páscoa.
 *
 * Datas sempre como texto `aaaa-mm-dd` (dia civil de Brasília), sem `Date` local: o servidor roda em UTC.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD.exec((ymd ?? "").trim().slice(0, 10));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Soma dias corridos a uma data `aaaa-mm-dd` (meio-dia UTC: sem efeito de fuso). */
export function somarDias(ymd: string, dias: number): string {
  const p = parse(ymd);
  if (!p) return ymd;
  const x = new Date(Date.UTC(p.y, p.m - 1, p.d + dias, 12));
  return fmt(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fmt(ano, mes, dia);
}

const cache = new Map<number, Map<string, string>>();

/** Feriados nacionais ANBIMA do ano: `aaaa-mm-dd` → nome. */
export function feriadosAnbima(ano: number): Map<string, string> {
  const pronto = cache.get(ano);
  if (pronto) return pronto;
  const pascoa = domingoDePascoa(ano);
  const lista: Array<[string, string]> = [
    [fmt(ano, 1, 1), "Confraternização Universal"],
    [somarDias(pascoa, -48), "Carnaval"],
    [somarDias(pascoa, -47), "Carnaval"],
    [somarDias(pascoa, -2), "Paixão de Cristo"],
    [fmt(ano, 4, 21), "Tiradentes"],
    [fmt(ano, 5, 1), "Dia do Trabalho"],
    [somarDias(pascoa, 60), "Corpus Christi"],
    [fmt(ano, 9, 7), "Independência do Brasil"],
    [fmt(ano, 10, 12), "Nossa Senhora Aparecida"],
    [fmt(ano, 11, 2), "Finados"],
    [fmt(ano, 11, 15), "Proclamação da República"],
    ...(ano >= 2024 ? ([[fmt(ano, 11, 20), "Dia Nacional de Zumbi e da Consciência Negra"]] as Array<[string, string]>) : []),
    [fmt(ano, 12, 25), "Natal"],
  ];
  const mapa = new Map(lista);
  cache.set(ano, mapa);
  return mapa;
}

/** Nome do feriado ANBIMA na data, ou `null`. */
export function feriadoAnbima(ymd: string): string | null {
  const p = parse(ymd);
  if (!p) return null;
  return feriadosAnbima(p.y).get(fmt(p.y, p.m, p.d)) ?? null;
}

export function ehFimDeSemana(ymd: string): boolean {
  const p = parse(ymd);
  if (!p) return false;
  const dia = new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Segunda a sexta e fora dos feriados nacionais ANBIMA. */
export function ehDiaUtil(ymd: string): boolean {
  return Boolean(parse(ymd)) && !ehFimDeSemana(ymd) && !feriadoAnbima(ymd);
}

/** Primeiro dia útil depois de `ymd` (não conta o próprio dia). */
export function proximoDiaUtil(ymd: string): string {
  if (!parse(ymd)) return ymd;
  let atual = somarDias(ymd, 1);
  while (!ehDiaUtil(atual)) atual = somarDias(atual, 1);
  return atual;
}

/** Dias úteis do dia seguinte a `de` até `ate`, inclusive; `null` com data inválida. */
export function contarDiasUteisAposAte(de: string, ate: string): number | null {
  const a = parse(de);
  const b = parse(ate);
  if (!a || !b) return null;
  const fim = fmt(b.y, b.m, b.d);
  let atual = somarDias(fmt(a.y, a.m, a.d), 1);
  let n = 0;
  while (atual <= fim) {
    if (ehDiaUtil(atual)) n += 1;
    atual = somarDias(atual, 1);
  }
  return n;
}

/** `ymd` + `n` dias úteis (n ≥ 0; com n = 0 volta o próprio dia). */
export function somarDiasUteis(ymd: string, n: number): string {
  let atual = ymd;
  for (let i = 0; i < n; i++) atual = proximoDiaUtil(atual);
  return atual;
}
