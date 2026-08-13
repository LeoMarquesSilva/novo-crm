/**
 * GET /api/crm/d4sign/documents/[uuid]/view
 *
 * Serve o PDF de um documento D4Sign com cache em Supabase Storage.
 *
 * Fluxo:
 *   1ª visualização  → baixa da D4Sign (1 req quota) → salva no bucket → serve ao browser
 *   Próximas vezes   → serve direto do bucket (0 req quota D4Sign)
 *
 * Bucket: `d4sign-contracts` (privado, acesso via service_role)
 */
import { after, NextResponse } from "next/server";
import {
  canViewD4SignDocument,
  canViewD4SignDocumentRecord,
} from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
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

  // ── 1. Tentar servir do cache (Supabase Storage) ──────────────────────────
  const { data: cached, error: cacheErr } = await supabase.storage
    .from(BUCKET)
    .download(filePath);

  if (!cacheErr && cached) {
    const buf = await cached.arrayBuffer();
    return pdfResponse(buf, uuid);
  }

  // ── 2. Cache miss → baixar da D4Sign (consome 1 req da quota) ────────────
  const env = getD4SignEnv();
  if (!env.tokenApi) {
    return NextResponse.json({ error: "D4Sign não configurado." }, { status: 503 });
  }

  const qs = new URLSearchParams({
    tokenAPI: env.tokenApi,
    ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}),
    type: "0", // 0 = PDF
  });

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      `${env.apiBaseUrl}/documents/${uuid}/download?${qs.toString()}`,
      { cache: "no-store" },
      20_000,
    );
    after(() => {
      logD4SignApiCall({
        endpoint: "documents/download",
        method: "GET",
        source: "view",
        httpStatus: upstream.status,
      });
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com a D4Sign." }, { status: 502 });
  }

  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return NextResponse.json(
      { error: `D4Sign retornou ${upstream.status}.` },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    await upstream.body?.cancel().catch(() => undefined);
    return NextResponse.json(
      { error: "D4Sign não retornou um arquivo PDF." },
      { status: 422 },
    );
  }

  const pdfBuffer = await upstream.arrayBuffer();

  // ── 3. Salvar no cache sem perder o trabalho no encerramento serverless ───
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

  // ── 4. Servir ao browser ──────────────────────────────────────────────────
  return pdfResponse(pdfBuffer, uuid);
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
