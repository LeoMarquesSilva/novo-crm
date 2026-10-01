/**
 * GET /api/crm/d4sign/documents/[uuid]/open
 *
 * "Abrir no D4Sign": redireciona para a página do documento no painel da
 * D4Sign (`/desk/viewblob/{uuid}`), que mostra a versão finalizada e
 * assinada. Exige login na conta com acesso ao cofre.
 *
 * Não usa `generate-document-view`: essa URL abre o arquivo original
 * enviado, sem as assinaturas.
 */
import { NextResponse } from "next/server";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { d4signDocumentPortalUrl } from "@/lib/d4sign/portal-url";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const portalBase = getD4SignEnv().apiBaseUrl.replace(/\/api\/.*$/, "");
  return NextResponse.redirect(d4signDocumentPortalUrl(portalBase, uuid));
}
