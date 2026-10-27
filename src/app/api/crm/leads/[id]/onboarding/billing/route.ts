/**
 * POST /api/crm/leads/[id]/onboarding/billing — o responsável envia os dados do faturamento
 * (cadastro já concluído por Operações Legais) e o lead vai para Inclusão no Faturamento.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { submitBilling } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { clientOnboardingPayloadSchema } from "@/modules/crm/domain/client-onboarding";

const bodySchema = z.object({ payload: clientOnboardingPayloadSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "submit_billing");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Dados do faturamento inválidos." }, { status: 400 });
    }
    const submitted = await submitBilling(result.supabase, {
      ctx: result.ctx,
      actor: result.actor,
      payload: parsed.data.payload,
    });
    return NextResponse.json({ ok: true, stage: "inclusao_faturamento", transitionId: submitted.transitionId });
  } catch (error) {
    return internalErrorResponse("onboarding/billing", error, "Não foi possível enviar os dados do faturamento.");
  }
}
