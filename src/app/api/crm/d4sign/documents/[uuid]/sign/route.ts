/**
 * GET /api/crm/d4sign/documents/[uuid]/sign
 *
 * "Assinar": abre o link de assinatura da D4Sign do sócio logado
 * (`GET /documents/{uuid}/signaturelink/{key_signer}`) — o mesmo link do
 * e-mail da D4Sign. Substitui o EMBED, que não está habilitado na conta
 * ("Esse documento não pode ser exibido via EMBED").
 *
 * Só gera o link para o próprio sócio, pendente no documento: o link assina
 * em nome dele. Qualquer outro caso (admin, sócio que já assinou, sem
 * `key_signer`, erro ou cota da D4Sign) cai no painel `/desk/viewblob/{uuid}`.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { parseSigners, resolvePartnerEmail, signerIsPending, toPartnerSigners } from "@/lib/d4sign/partner-signatures";
import { d4signDocumentPortalUrl } from "@/lib/d4sign/portal-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const env = getD4SignEnv();
  const portal = NextResponse.redirect(
    d4signDocumentPortalUrl(env.apiBaseUrl.replace(/\/api\/.*$/, ""), uuid),
  );

  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  const partners = toPartnerSigners(getFirmSigners());
  const me = resolvePartnerEmail(auth.user.email, partners);
  if (!me || !env.tokenApi) return portal;

  const { data: doc } = await createSupabaseAdminClient()
    .from("d4sign_documents")
    .select("signers")
    .eq("uuid_doc", uuid)
    .maybeSingle();
  const mine = parseSigners(doc?.signers).find(
    (s) => resolvePartnerEmail(s.email, partners) === me && signerIsPending(s) && s.key_signer,
  );
  if (!mine?.key_signer) return portal;

  const quota = await getD4SignQuotaStatus("documents/signaturelink");
  if (quota.remaining < 1) return portal;

  try {
    const link = await D4SignConnector.fromEnv(env).getSignatureLink(uuid, mine.key_signer);
    return NextResponse.redirect(link);
  } catch (error) {
    console.error("[D4Sign] link de assinatura falhou", {
      uuid,
      error: error instanceof Error ? error.message : String(error),
    });
    return portal;
  }
}
