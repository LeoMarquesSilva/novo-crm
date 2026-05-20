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
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET  = "d4sign-contracts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const authResult = await requireAuthApi();
  if (authResult instanceof NextResponse) return authResult;

  const { uuid } = await params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: "UUID inválido." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const filePath = `${uuid}.pdf`;

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
    upstream = await fetch(
      `${env.apiBaseUrl}/documents/${uuid}/download?${qs.toString()}`,
      { cache: "no-store" },
    );
    logD4SignApiCall({
      endpoint: "documents/download",
      method: "GET",
      source: "view",
      httpStatus: upstream.status,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com a D4Sign." }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `D4Sign retornou ${upstream.status}.`, detail: text.slice(0, 300) },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await upstream.json().catch(() => ({}));
    return NextResponse.json(
      { error: "D4Sign não retornou arquivo.", detail: json },
      { status: 422 },
    );
  }

  const pdfBuffer = await upstream.arrayBuffer();

  // ── 3. Salvar no cache (fire-and-forget, não bloqueia a resposta) ─────────
  void supabase.storage
    .from(BUCKET)
    .upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

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
    },
  });
}
