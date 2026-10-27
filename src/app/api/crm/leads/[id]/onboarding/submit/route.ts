/**
 * POST /api/crm/leads/[id]/onboarding/submit — envia o cadastro para Operações Legais (ou
 * reenvia o devolvido, sem mudar a etapa).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { submitOnboarding } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { clientOnboardingPayloadSchema } from "@/modules/crm/domain/client-onboarding";

const bodySchema = z.object({ payload: clientOnboardingPayloadSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "submit");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Dados do cadastro inválidos." }, { status: 400 });
    }
    const submitted = await submitOnboarding(result.supabase, {
      ctx: result.ctx,
      actor: result.actor,
      payload: parsed.data.payload,
    });
    return NextResponse.json({ ok: true, stage: submitted.stage, transitionId: submitted.transitionId });
  } catch (error) {
    return internalErrorResponse("onboarding/submit", error, "Não foi possível enviar o cadastro.");
  }
}
