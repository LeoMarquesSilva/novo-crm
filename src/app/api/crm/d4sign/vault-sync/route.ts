/**
 * POST /api/crm/d4sign/vault-sync
 * Atualização unificada do cofre: listagem + pastas + enrich automático.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { runVaultSync } from "@/lib/d4sign/vault-sync";

export async function POST() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const result = await runVaultSync({ apiSource: "vault-sync" });

    if (!result.ok) {
      return NextResponse.json(result, { status: result.rateLimited ? 429 : 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar cofre.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
