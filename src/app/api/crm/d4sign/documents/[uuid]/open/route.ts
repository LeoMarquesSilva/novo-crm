/**
 * GET /api/crm/d4sign/documents/[uuid]/open
 *
 * "Abrir no D4Sign": pede à D4Sign uma URL de visualização temporária
 * (`generate-document-view`, válida por 5 min, sem login) e redireciona.
 * Sem cota desse método ou com erro, cai no painel logado
 * (`/desk/viewblob/{uuid}`), que exige login na conta dona do cofre.
 */
import { NextResponse } from "next/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { d4signDocumentPortalUrl } from "@/lib/d4sign/portal-url";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const env = getD4SignEnv();
  const portal = d4signDocumentPortalUrl(env.apiBaseUrl.replace(/\/api\/.*$/, ""), uuid);
  if (!env.tokenApi) return NextResponse.redirect(portal);

  const quota = await getD4SignQuotaStatus("documents/generate-document-view");
  if (quota.remaining < 1) return NextResponse.redirect(portal);

  try {
    const link = await D4SignConnector.fromEnv(env).generateDocumentView(uuid);
    return NextResponse.redirect(link);
  } catch (error) {
    console.error("[D4Sign] generate-document-view falhou", {
      uuid,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(portal);
  }
}
