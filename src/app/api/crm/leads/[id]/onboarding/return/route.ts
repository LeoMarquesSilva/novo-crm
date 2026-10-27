/**
 * POST /api/crm/leads/[id]/onboarding/return — Operações Legais devolve para ajuste, apontando
 * os campos; o lead fica na etapa em que está (o responsável corrige e reenvia).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { returnOnboarding } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { onboardingAdjustmentSchema } from "@/modules/crm/domain/client-onboarding";

const bodySchema = z
  .object({
    comment: z.string().trim().max(2000).default(""),
    ajustes: z.array(onboardingAdjustmentSchema).max(20).default([]),
  })
  .refine((body) => body.ajustes.length > 0 || body.comment.length >= 5, {
    message: "Aponte ao menos um campo ou explique o que precisa ser ajustado (mínimo 5 caracteres).",
  });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "return");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Devolução inválida." },
        { status: 400 },
      );
    }
    const returned = await returnOnboarding(result.supabase, {
      ctx: result.ctx,
      actor: result.actor,
      comment: parsed.data.comment,
      ajustes: parsed.data.ajustes,
    });
    return NextResponse.json({ ok: true, stage: returned.stage });
  } catch (error) {
    return internalErrorResponse("onboarding/return", error, "Não foi possível devolver o cadastro.");
  }
}
