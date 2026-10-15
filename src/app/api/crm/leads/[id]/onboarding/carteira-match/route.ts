/** GET /api/crm/leads/[id]/onboarding/carteira-match?grupo= — cliente pelo CPF/CNPJ e grupos pelo nome. */
import { NextResponse } from "next/server";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { findCarteiraMatches } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "review");
    if (!result.ok) return result.response;
    const grupo = new URL(request.url).searchParams.get("grupo") ?? result.ctx.checklist.grupoNome;
    const match = await findCarteiraMatches(result.supabase, {
      documento: result.ctx.payload.cadastro.documento,
      grupoNome: grupo,
    });
    return NextResponse.json({ ok: true, ...match });
  } catch (error) {
    return internalErrorResponse("onboarding/carteira-match", error, "Não foi possível consultar a carteira.");
  }
}
