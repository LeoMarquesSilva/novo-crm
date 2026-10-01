/**
 * Reparte a cota de uma janela do sync D4Sign.
 *
 * A listagem por fase (até 500 contratos por chamada, em qualquer pasta)
 * vem antes do signatário (1 contrato por chamada). Enquanto essa listagem
 * não fecha, a janela inteira — menos 1 página da raiz — importa contratos.
 * Depois, 1 página da fase 3 atualiza os pendentes mais recentes e o resto
 * busca signatários. Pasta de cliente só entra quando não há pendente sem
 * signatário: é o que a fase 2/3 não devolve (contrato já finalizado).
 */

export type D4SignSyncBudget = {
  listing: number;
  phases: number;
  enrich: number;
  folders: number;
};

export function planD4SignSyncBudget(input: {
  remaining: number;
  phaseCycleOpen: boolean;
  pendingWithoutSigners: number;
  /** `backlog` = primeira volta nas pastas. `rotate` = uma pasta por janela. */
  folderMode: "backlog" | "rotate" | "none";
}): D4SignSyncBudget {
  let left = Number.isFinite(input.remaining) ? Math.max(0, Math.floor(input.remaining)) : 0;
  const listing = Math.min(1, left);
  left -= listing;

  if (input.phaseCycleOpen) {
    return { listing, phases: left, enrich: 0, folders: 0 };
  }

  const phases = Math.min(1, left);
  left -= phases;

  if (input.pendingWithoutSigners > 0) {
    return { listing, phases, enrich: left, folders: 0 };
  }

  const folders =
    input.folderMode === "none" ? 0 : input.folderMode === "rotate" ? Math.min(1, left) : left;
  left -= folders;
  return { listing, phases, enrich: left, folders };
}
