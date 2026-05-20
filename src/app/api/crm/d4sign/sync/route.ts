/**
 * POST /api/crm/d4sign/sync
 * @deprecated Use POST /api/crm/d4sign/vault-sync — mantido para compatibilidade.
 * Sync rápido: listagem bulk + pastas, sem enrich extra.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { runVaultSync } from "@/lib/d4sign/vault-sync";

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");
    const xCron = request.headers.get("x-cron-secret");
    const isCron =
      Boolean(cronSecret) &&
      (auth === `Bearer ${cronSecret}` || xCron === cronSecret);

    if (!isCron) {
      const a = await requireAuthApi();
      if (!a.ok) return a.response;
      if (!a.profile || !["admin", "comercial"].includes(String(a.profile.role))) {
        return NextResponse.json(
          { ok: false, error: "Apenas comercial ou admin pode sincronizar." },
          { status: 403 },
        );
      }
    }

    const result = await runVaultSync({
      skipFolderWalk: true,
      enrichAfter: 0,
      apiSource: isCron ? "sync-cron" : "sync",
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, rateLimited: result.rateLimited, quota: result.quota },
        { status: result.rateLimited ? 429 : 500 },
      );
    }

    return NextResponse.json({
      ...result,
      total: result.imported,
      upserted: result.imported,
      via: isCron ? "cron" : "user",
      deprecated: "Use POST /api/crm/d4sign/vault-sync",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/crm/d4sign/sync
 * Retorna contratos vinculados a oportunidades (sem chamar API D4Sign).
 */
export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("oportunidades")
      .select(
        "id, solicitante_nome, etapa, d4sign_document_uuid, d4sign_status, d4sign_updated_at, link_contrato, updated_at",
      )
      .not("d4sign_document_uuid", "is", null)
      .order("d4sign_updated_at", { ascending: false, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar contratos D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
