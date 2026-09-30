/**
 * GET /api/crm/d4sign/documents/[uuid]/view
 *
 * Serve o PDF de um documento D4Sign com cache em Supabase Storage.
 *
 * Fluxo:
 *   1ª visualização  → POST /documents/{uuid}/download (1 req quota) → baixa a URL
 *                      devolvida → só então salva no bucket e serve ao browser
 *   Próximas vezes   → serve direto do bucket (0 req quota D4Sign)
 *
 * Cache vazio ou que não começa com `%PDF` é apagado e baixado de novo.
 * Corpo inválido responde 422 e não é gravado.
 *
 * Bucket: `d4sign-contracts` (privado, acesso via service_role)
 */
import { after, NextResponse } from "next/server";
import {
  canViewD4SignDocument,
  canViewD4SignDocumentRecord,
} from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { downloadD4SignDocumentPdf } from "@/lib/d4sign/download-document";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { isFirmSignerEmail } from "@/lib/d4sign/firm-signers";
import { isPdfBytes, readCachedPdf } from "@/lib/d4sign/pdf-bytes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET  = "d4sign-contracts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const authResult = await requireAuthApi();
  if (!authResult.ok) return authResult.response;

  if (!canViewD4SignDocument({ role: authResult.profile.role })) {
    return NextResponse.json({ error: "Sem permissão para visualizar documentos D4Sign." }, { status: 403 });
  }

  const { uuid } = await params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: "UUID inválido." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const filePath = `${uuid}.pdf`;

  const { data: document, error: documentError } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, oportunidade_id")
    .eq("uuid_doc", uuid)
    .maybeSingle();

  if (documentError) {
    console.error("Falha ao autorizar visualização D4Sign", documentError);
    return NextResponse.json(
      { error: "Não foi possível validar o documento." },
      { status: 500 },
    );
  }
  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  if (!canViewD4SignDocumentRecord({
    role: authResult.profile.role,
    oportunidadeId: document.oportunidade_id,
    isFirmPartner: isFirmSignerEmail(authResult.user.email),
  })) {
    return NextResponse.json({ error: "Sem permissão para visualizar documentos D4Sign." }, { status: 403 });
  }

  if (document.oportunidade_id) {
    const { data: opportunity, error: opportunityError } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", document.oportunidade_id)
      .maybeSingle();

    if (opportunityError) {
      console.error("Falha ao validar oportunidade do documento D4Sign", opportunityError);
      return NextResponse.json(
        { error: "Não foi possível validar o documento." },
        { status: 500 },
      );
    }
    if (!opportunity) {
      return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    }
  }

  const bucket = supabase.storage.from(BUCKET);
  const cached = await readCachedPdf(bucket, filePath);
  if (cached) return pdfResponse(cached, uuid);

  const env = getD4SignEnv();
  if (!env.tokenApi) {
    return NextResponse.json({ error: "D4Sign não configurado." }, { status: 503 });
  }

  const downloaded = await downloadD4SignDocumentPdf({
    uuid,
    apiBaseUrl: env.apiBaseUrl,
    tokenApi: env.tokenApi,
    cryptKey: env.cryptKey,
  });

  if (downloaded.apiStatus !== null) {
    const apiStatus = downloaded.apiStatus;
    after(() => {
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "POST",
        source: "view",
        httpStatus: apiStatus,
      });
    });
  }

  if (!downloaded.ok) {
    return NextResponse.json({ error: downloaded.error }, { status: downloaded.status });
  }
  if (!isPdfBytes(downloaded.bytes)) {
    return NextResponse.json({ error: "D4Sign não retornou um arquivo PDF." }, { status: 422 });
  }

  const pdfBuffer = downloaded.bytes.slice(0);
  after(async () => {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      console.error("Falha ao armazenar PDF D4Sign em cache", uploadError);
    }
  });

  return pdfResponse(downloaded.bytes, uuid);
}

function pdfResponse(buf: ArrayBuffer, uuid: string): NextResponse {
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${uuid}.pdf"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
