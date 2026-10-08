/**
 * GET /api/crm/d4sign/partner-sign-assumptions
 *
 * Baixas provisórias ainda abertas (sócio clicou em Assinar e a D4Sign
 * ainda não releu os signatários). O painel do administrador e o do outro
 * sócio usam a mesma lista.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { loadSharedPartnerSignAssumptions } from "@/lib/d4sign/partner-sign-refresh-queue";
import { canAccessPartnerSignatures, toPartnerSigners } from "@/lib/d4sign/partner-signatures";

export async function GET() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const partners = toPartnerSigners(getFirmSigners());
  if (!canAccessPartnerSignatures({ role: auth.profile.role, email: auth.user.email, partners })) {
    return NextResponse.json({ ok: false, error: "Sem acesso a Assinar Contratos." }, { status: 403 });
  }

  try {
    const assumptions = await loadSharedPartnerSignAssumptions();
    return NextResponse.json({ ok: true, assumptions });
  } catch (error) {
    console.error("[D4Sign] baixas provisórias", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível ler as assinaturas em confirmação." },
      { status: 500 },
    );
  }
}
