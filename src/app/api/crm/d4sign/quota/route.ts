/**
 * GET /api/crm/d4sign/quota
 * Retorna uso da quota API D4Sign na última hora (10 req/h padrão).
 */
import { NextResponse } from "next/server";
import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";

export async function GET() {
  try {
    const auth = await requireLeadActionApi({ action: "d4sign.ops" });
    if (!auth.ok) return auth.response;

    const quota = await getD4SignQuotaStatus("documents/list");
    return NextResponse.json({ ok: true, ...quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar quota.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
