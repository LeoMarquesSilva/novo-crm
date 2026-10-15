/**
 * POST /api/crm/d4sign/vault-sync
 * Atualização unificada do cofre: listagem + pastas + enrich automático.
 */
import { NextResponse } from "next/server";
import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { runVaultSync } from "@/lib/d4sign/vault-sync";

export async function POST() {
  try {
    const auth = await requireLeadActionApi({ action: "d4sign.ops" });
    if (!auth.ok) return auth.response;

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
