/**
 * POST /api/crm/leads/[id]/onboarding/vios/sync — "Atualizar grupos do CRM": dispara o gatilho
 * do n8n que puxa as Pessoas do VIOS para o SIOE (`VIOS_PESSOAS_SYNC_WEBHOOK_URL`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { triggerViosPessoasSync } from "@/lib/crm/client-onboarding/vios-pessoas";
import { internalErrorResponse } from "@/lib/http/api-errors";

const bodySchema = z.object({ grupo: z.string().trim().max(200).nullable().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "review");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    await triggerViosPessoasSync({
      opportunityId: result.ctx.opportunity.id,
      grupo: parsed.success ? (parsed.data.grupo ?? null) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalErrorResponse("onboarding/vios-sync", error, "Não foi possível pedir a atualização do VIOS.");
  }
}
