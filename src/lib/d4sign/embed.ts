/**
 * EMBED da D4Sign (assinatura em iframe no CRM).
 *
 * A conta passou a aceitar o EMBED (confirmado em 2026-10-09 no contrato da
 * Isabella). O "Assinar" abre o documento dentro do CRM. `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=0`
 * volta ao link externo (`/api/crm/d4sign/documents/[uuid]/sign`).
 * @see https://docapi.d4sign.com.br/docs/primeiros-passos.md
 * @see https://docapi.d4sign.com.br/docs/instalação.md
 */

export function isD4SignEmbedEnabled(): boolean {
  return process.env.NEXT_PUBLIC_D4SIGN_EMBED_ENABLED?.trim() !== "0";
}

export const D4SIGN_SAFARI_FIX_COOKIE = "fixed";

/**
 * Correção de Safari da documentação: sem o cookie `fixed`, a página vai uma
 * vez para `embed/safari_fix` (que libera o cookie da D4Sign no Safari) e
 * volta para `r`. Devolve a URL de destino, ou null quando não precisa.
 */
export function d4signSafariFixUrl(input: {
  userAgent: string;
  cookie: string;
  href: string;
}): string | null {
  const isChrome = input.userAgent.includes("Chrome");
  const isSafari = input.userAgent.includes("Safari") && !isChrome;
  if (!isSafari) return null;
  if (/(^|;)\s*fixed\s*=\s*[^;]+/.test(input.cookie)) return null;

  const url = new URL(input.href);
  const param = url.search.replace(/^\?/, "");
  url.search = "";
  url.hash = "";
  return `https://secure.d4sign.com.br/embed/safari_fix?param=${encodeURIComponent(param)}&r=${encodeURIComponent(url.toString())}`;
}
