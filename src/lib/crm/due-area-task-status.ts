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
