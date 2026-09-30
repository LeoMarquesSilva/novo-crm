/**
 * Plano do backfill de contratos D4Sign ainda sem assinatura finalizada.
 * A listagem por fase (`GET /documents/{fase}/status`) devolve documentos de
 * qualquer pasta — a listagem da raiz do cofre não faz isso.
 *
 * Fase 3 = aguardando assinaturas. Fase 2 = aguardando signatários.
 */

export const PENDING_SIGNATURE_PHASES = [3, 2] as const;
export type PendingSignaturePhase = (typeof PENDING_SIGNATURE_PHASES)[number];

/** A D4Sign devolve no máximo 500 documentos por página. */
export const D4SIGN_PHASE_PAGE_SIZE = 500;

/**
 * Teto de chamadas por execução. A cota global é 10/h e cada chamada
 * traz até 500 documentos, então uma janela fecha até 5.000 contratos.
 * A função para antes se as fases 2 e 3 acabarem.
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
  if (phase !== 2 && phase !== 3) return initialPendingCursor();
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
  if (current.phase === 3) return { phase: 2, page: 1 };
  return "done";
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
