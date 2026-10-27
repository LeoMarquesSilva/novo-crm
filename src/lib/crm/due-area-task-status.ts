export type DueAreaTaskStatus = "pendente" | "em_andamento" | "disponibilizado";

export function getDueAreaTaskStatus(params: {
  status: DueAreaTaskStatus;
  prazoAte: string | null;
  now?: Date;
}): DueAreaTaskStatus | "atrasado" {
  if (params.status === "disponibilizado") return "disponibilizado";
  if (!params.prazoAte) return params.status;
  const due = new Date(params.prazoAte);
  if (Number.isNaN(due.getTime())) return params.status;
  return due.getTime() < (params.now ?? new Date()).getTime() ? "atrasado" : params.status;
}

type DueReviewTaskRow = { area_key: string | null; status: string | null; revision_cycle: number | string | null };

/**
 * Revisão da DUE aprovada no ciclo atual: vale a última tarefa de cada área até esse ciclo.
 * Um ciclo novo só recria as áreas que pediram ajuste ou ainda não responderam; quem aprovou antes
 * continua aprovado, e área com tarefa pendente de ciclo anterior segura a finalização.
 */
export function isDueReviewApprovedForCycle(rows: DueReviewTaskRow[], revisionCycle: number): boolean {
  const cycleOf = (row: DueReviewTaskRow) => Number(row.revision_cycle) || 0;
  const relevant = rows.filter((row) => cycleOf(row) <= revisionCycle);
  if (!relevant.some((row) => cycleOf(row) === revisionCycle)) return false;
  const latestByArea = new Map<string, DueReviewTaskRow>();
  for (const row of relevant) {
    const area = String(row.area_key ?? "");
    const current = latestByArea.get(area);
    if (!current || cycleOf(row) > cycleOf(current)) latestByArea.set(area, row);
  }
  return [...latestByArea.values()].every((row) => row.status === "ok");
}

/** Área entregou o levantamento (pasta confirmada ou declarou que não há processos ativos). */
export function isDueAreaTaskDelivered(row: {
  status: string;
  pasta_due_confirmada: boolean | null;
  sem_processos_ativos?: boolean | null;
}): boolean {
  if (row.status !== "disponibilizado") return false;
  if (row.sem_processos_ativos) return true;
  return Boolean(row.pasta_due_confirmada);
}
