/**
 * Reparte a cota de uma rodada do sync D4Sign.
 *
 * A D4Sign limita 10 req/h por método, então cada etapa usa a cota do seu
 * método: listagem da raiz e pastas (`documents/safe`), fases
 * (`documents/status`), signatários (`documents/list`) e PDF
 * (`documents/download`). O cron nunca encosta nas vagas reservadas para
 * quem está usando o CRM — abrir um PDF ou buscar signatários na hora.
 */

/** Vagas por hora que o cron deixa livres para ações manuais. */
export const D4SIGN_HUMAN_RESERVE = {
  safe: 2,
  list: 3,
  download: 6,
} as const;

export type D4SignSyncBudget = {
  listing: number;
  phases: number;
  enrich: number;
  folders: number;
  precache: number;
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
  phaseCycleOpen: boolean;
  /** `backlog` = primeira volta nas pastas. `rotate` = uma pasta por rodada. */
  folderMode: "backlog" | "rotate" | "none";
}): D4SignSyncBudget {
  let safe = free(input.remaining.safe, D4SIGN_HUMAN_RESERVE.safe);
  const listing = Math.min(1, safe);
  safe -= listing;

  const folders =
    input.folderMode === "none" ? 0 : input.folderMode === "rotate" ? Math.min(1, safe) : safe;

  const status = free(input.remaining.status);
  const phases = input.phaseCycleOpen ? status : Math.min(1, status);

  return {
    listing,
    phases,
    enrich: free(input.remaining.list, D4SIGN_HUMAN_RESERVE.list),
    folders,
    precache: Math.min(1, free(input.remaining.download, D4SIGN_HUMAN_RESERVE.download)),
  };
}
