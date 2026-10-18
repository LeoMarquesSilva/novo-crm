/** Soma meses mantendo o dia do vencimento (31/01 + 1 mês = 28/02). */
export function addMonthsKeepingDay(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day ?? 1, lastDay)).padStart(2, "0")}`;
}

/** Competência (AAAA-MM-01) do mês da data. */
export function competencyOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Divide o total em parcelas iguais; a sobra de centavos vai para a última. */
export function splitTotalCents(totalCents: number, count: number): number[] {
  const parts = Math.max(1, Math.floor(count));
  const per = Math.floor(totalCents / parts);
  return Array.from({ length: parts }, (_, index) => (index === parts - 1 ? totalCents - per * (parts - 1) : per));
}
