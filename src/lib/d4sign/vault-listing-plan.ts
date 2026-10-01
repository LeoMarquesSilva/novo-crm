/**
 * Cursor da listagem em lote do cofre (`GET /documents/{safe}/safe`).
 *
 * A documentação oficial não devolve data de criação nem diz que a página 1
 * traz os contratos mais novos. O primeiro bloco da resposta é `totalOfPages`.
 * Por isso cada execução avança uma página e, quando a página acaba, volta à 1
 * — o cofre inteiro é revisto e um contrato novo não fica só numa página que
 * o cron nunca lê.
 *
 * O conector descarta o bloco de paginação. Uma página cheia de 500 itens
 * chega com 499 documentos.
 */

export const VAULT_SAFE_CURSOR_ENDPOINT = "cursor/vault-safe";

/** Teto anunciado pela D4Sign, incluindo o bloco de paginação. */
export const VAULT_LISTING_PAGE_CAP = 500;

/** Documentos numa página cheia, depois de descartar `totalOfPages`. */
export const VAULT_LISTING_FULL_PAGE_DOCS = VAULT_LISTING_PAGE_CAP - 1;

/** Cota do método por hora. A listagem em lote não passa disso numa janela. */
export const VAULT_LISTING_MAX_REQUESTS = 10;

export function parseVaultPageCursor(source: string | null | undefined): number {
  const match = /page=(\d+)/.exec(source ?? "");
  const page = Number(match?.[1]);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function formatVaultPageCursor(page: number): string {
  const safe = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return `page=${safe}`;
}

/**
 * Próxima página. `finishedCycle` significa que esta página era a última
 * (curta, ou igual a `totalPages`) e o cursor voltou para 1.
 */
export function nextVaultListingPage(
  currentPage: number,
  info: { docs: number; totalPages: number | null },
): { nextPage: number; finishedCycle: boolean } {
  const page = currentPage >= 1 ? currentPage : 1;
  const hasMore =
    info.totalPages != null && info.totalPages >= 1
      ? page < info.totalPages
      : info.docs >= VAULT_LISTING_FULL_PAGE_DOCS;
  if (hasMore) return { nextPage: page + 1, finishedCycle: false };
  return { nextPage: 1, finishedCycle: true };
}
