/**
 * EMBED da D4Sign (assinatura em iframe no CRM).
 *
 * A ativação é da conta, feita pelo suporte da D4Sign (suporte@d4sign.com.br);
 * sem ela qualquer documento responde "EMBED DESABILITADO". Por isso o CRM só
 * usa o EMBED com `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=1`; sem a variável, o
 * "Assinar" abre o link de assinatura (`/api/crm/d4sign/documents/[uuid]/sign`).
 * @see https://docapi.d4sign.com.br/docs/primeiros-passos.md
 * @see https://docapi.d4sign.com.br/docs/instalação.md
 */

export function isD4SignEmbedEnabled(): boolean {
  return process.env.NEXT_PUBLIC_D4SIGN_EMBED_ENABLED?.trim() === "1";
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
