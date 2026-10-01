/**
 * Plano da listagem por fase (`GET /documents/{fase}/status`), que devolve
 * documentos de qualquer pasta — a listagem da raiz do cofre não faz isso.
 * Até 500 por chamada, então a conta inteira cabe em poucas chamadas.
 *
 * O ciclo percorre todas as fases, das que mudam mais para as que mudam menos:
 * 3 aguardando assinaturas, 2 aguardando signatários, 4 finalizado,
 * 1 processando, 6 cancelado, 5 arquivado, 7 em edição. Sem a fase 4, um
 * contrato finalizado dentro de pasta só entrava quando a varredura de
 * pastas chegasse nela.
 */

export const PENDING_SIGNATURE_PHASES = [3, 2, 4, 1, 6, 5, 7] as const;
export type PendingSignaturePhase = (typeof PENDING_SIGNATURE_PHASES)[number];

function isPhase(value: number): value is PendingSignaturePhase {
  return (PENDING_SIGNATURE_PHASES as readonly number[]).includes(value);
}

/** A D4Sign devolve no máximo 500 documentos por página. */
export const D4SIGN_PHASE_PAGE_SIZE = 500;

/**
 * Teto de chamadas por execução: a cota do método é 10/h e cada chamada
 * traz até 500 documentos. A função para antes se o ciclo de fases fechar.
 */
export const PENDING_BACKFILL_MAX_REQUESTS = 10;

export const PENDING_BACKFILL_CURSOR_ENDPOINT = "cursor/pending-signatures";

const STATUSID_TO_STATUS: Record<number, string> = {
  1: "processing",
  2: "sent",
  3: "3",
  4: "1",
  5: "4",
  6: "6",
  7: "7",
};

export type PendingBackfillCursor = {
  phase: PendingSignaturePhase;
  page: number;
};

export function initialPendingCursor(): PendingBackfillCursor {
  return { phase: 3, page: 1 };
}

export function formatPendingCursor(cursor: PendingBackfillCursor | "done"): string {
  if (cursor === "done") return "done";
  return `phase=${cursor.phase};page=${cursor.page}`;
}

export function parsePendingCursor(source: string | null | undefined): PendingBackfillCursor | "done" {
  if (!source || source === "done") return source === "done" ? "done" : initialPendingCursor();
  const phaseMatch = /phase=(\d+)/.exec(source);
  const pageMatch = /page=(\d+)/.exec(source);
  const phase = Number(phaseMatch?.[1]);
  const page = Number(pageMatch?.[1]);
  if (!isPhase(phase)) return initialPendingCursor();
  return { phase, page: Number.isFinite(page) && page >= 1 ? page : 1 };
}

/**
 * Próxima página. `totalPages` vem do primeiro bloco da resposta D4Sign.
 * Sem esse total, uma página quase cheia (o bloco de paginação ocupa um slot)
 * continua; uma página curta encerra a fase.
 */
export function advancePendingCursor(
  current: PendingBackfillCursor,
  info: { docs: number; totalPages: number | null },
): PendingBackfillCursor | "done" {
  const hasMore =
    info.totalPages != null
      ? current.page < info.totalPages
      : info.docs >= D4SIGN_PHASE_PAGE_SIZE - 1;

  if (hasMore) {
    return { phase: current.phase, page: current.page + 1 };
  }
  const nextPhase = PENDING_SIGNATURE_PHASES[PENDING_SIGNATURE_PHASES.indexOf(current.phase) + 1];
  return nextPhase ? { phase: nextPhase, page: 1 } : "done";
}

export function mapPendingStatusId(raw: number | string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (Number.isNaN(n)) return null;
  return STATUSID_TO_STATUS[n] ?? String(n);
}

export function documentBelongsToSafe(
  uuidSafe: string | undefined,
  configuredSafeUuid: string,
): boolean {
  if (!uuidSafe?.trim()) return true;
  return uuidSafe.trim().toLowerCase() === configuredSafeUuid.trim().toLowerCase();
}
