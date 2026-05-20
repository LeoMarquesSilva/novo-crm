/**
 * GET /api/crm/d4sign/quota
 * Retorna uso da quota API D4Sign na última hora (10 req/h padrão).
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const quota = await getD4SignQuotaStatus();
    return NextResponse.json({ ok: true, ...quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar quota.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
