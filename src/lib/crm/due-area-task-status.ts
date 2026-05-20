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
