/**
 * Página do documento no painel logado da D4Sign.
 * `/desk/viewdoc/` responde 404. `/desk/viewblob/{uuid}` abre o documento
 * (ou o login, com retorno para essa mesma página). Só funciona logado na
 * conta que tem acesso ao cofre — para links do CRM use `d4signDocumentOpenPath`.
 */
export function d4signDocumentPortalUrl(portalBase: string, documentUuid: string): string {
  const base = portalBase.replace(/\/+$/, "");
  return `${base}/desk/viewblob/${documentUuid}`;
}

/**
 * Rota do CRM que abre o documento na D4Sign com URL temporária
 * (`generate-document-view`), sem depender de login no portal.
 */
export function d4signDocumentOpenPath(documentUuid: string): string {
  return `/api/crm/d4sign/documents/${encodeURIComponent(documentUuid)}/open`;
}

/**
 * Rota do CRM que abre o link de assinatura da D4Sign do sócio logado
 * (substitui o EMBED, desabilitado na conta).
 */
export function d4signDocumentSignPath(documentUuid: string): string {
  return `/api/crm/d4sign/documents/${encodeURIComponent(documentUuid)}/sign`;
}
