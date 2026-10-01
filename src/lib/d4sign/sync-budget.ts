/**
 * Reparte a cota de uma rodada do sync D4Sign.
 *
 * A D4Sign limita 10 req/h por método, então cada etapa usa a cota do seu
 * método: fases (`documents/status`, cobre a conta inteira, qualquer pasta),
 * signatários (`documents/list`), listagem da raiz e pastas
 * (`documents/safe`) e PDF para o log do remetente (`documents/download`). O cron nunca encosta nas
 * vagas reservadas para quem está usando o CRM — abrir um PDF ou buscar
 * signatários na hora. Ninguém mais usa `documents/status`, então as fases
 * não têm reserva.
 */

/** Vagas por hora que o sync deixa livres para ações manuais. */
export const D4SIGN_HUMAN_RESERVE = {
  safe: 2,
  list: 2,
  download: 4,
} as const;

export type D4SignSyncBudget = {
  listing: number;
  phases: number;
  enrich: number;
  folders: number;
  /** Baixas de PDF para ler o remetente no log (e guardar os finalizados). */
  pdfLogs: number;
};

export type D4SignSyncRemaining = {
  safe: number;
  status: number;
  list: number;
  download: number;
};

function free(remaining: number, reserve = 0): number {
  const n = Number.isFinite(remaining) ? Math.floor(remaining) : 0;
  return Math.max(0, n - reserve);
}

export function planD4SignSyncBudget(input: {
  remaining: D4SignSyncRemaining;
  /** `backlog` = primeira volta nas pastas. `rotate` = uma pasta por rodada. */
  folderMode: "backlog" | "rotate" | "none";
}): D4SignSyncBudget {
  let safe = free(input.remaining.safe, D4SIGN_HUMAN_RESERVE.safe);
  const listing = Math.min(1, safe);
  safe -= listing;

  const folders =
    input.folderMode === "none" ? 0 : input.folderMode === "rotate" ? Math.min(1, safe) : safe;

  return {
    listing,
    phases: free(input.remaining.status),
    enrich: free(input.remaining.list, D4SIGN_HUMAN_RESERVE.list),
    folders,
    pdfLogs: free(input.remaining.download, D4SIGN_HUMAN_RESERVE.download),
  };
}
