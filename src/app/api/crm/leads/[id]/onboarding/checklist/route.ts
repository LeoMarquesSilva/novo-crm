/** PATCH /api/crm/leads/[id]/onboarding/checklist — checklist de Operações Legais. */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { saveOpsChecklist } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { listMissingChecklistItems, opsChecklistSchema } from "@/modules/crm/domain/client-onboarding";

const bodySchema = z.object({ checklist: opsChecklistSchema });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "review");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Checklist inválido." }, { status: 400 });
    await saveOpsChecklist(result.supabase, { ctx: result.ctx, actor: result.actor, checklist: parsed.data.checklist });
    return NextResponse.json({ ok: true, missingChecklist: listMissingChecklistItems(parsed.data.checklist) });
  } catch (error) {
    return internalErrorResponse("onboarding/checklist", error, "Não foi possível salvar o checklist.");
  }
}
