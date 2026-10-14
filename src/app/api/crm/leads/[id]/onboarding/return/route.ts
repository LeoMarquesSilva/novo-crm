/** POST /api/crm/leads/[id]/onboarding/return — Operações Legais devolve para ajuste. */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { returnOnboarding } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";

const bodySchema = z.object({
  comment: z.string().trim().min(5, "Explique o que precisa ser ajustado (mínimo 5 caracteres).").max(2000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "return");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Comentário inválido." },
        { status: 400 },
      );
    }
    await returnOnboarding(result.supabase, { ctx: result.ctx, actor: result.actor, comment: parsed.data.comment });
    return NextResponse.json({ ok: true, stage: "aguardando_cadastro" });
  } catch (error) {
    return internalErrorResponse("onboarding/return", error, "Não foi possível devolver o cadastro.");
  }
}
