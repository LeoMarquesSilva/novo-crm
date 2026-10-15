/**
 * GET /api/crm/leads/[id]/onboarding — cadastro do cliente (rascunho salvo ou
 *     pré-preenchido com os dados do lead), checklist de Operações Legais e permissões.
 * PUT /api/crm/leads/[id]/onboarding — salva o rascunho (responsável em Aguardando
 *     Cadastro; Operações Legais corrige em Cadastro de Novo Cliente).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { evaluateOnboardingAction, saveOnboardingDraft } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import {
  clientOnboardingPayloadSchema,
  listMissingChecklistItems,
  listMissingOnboardingFields,
} from "@/modules/crm/domain/client-onboarding";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params);
    if (!result.ok) return result.response;
    const { ctx, actor } = result;
    const can = (action: Parameters<typeof evaluateOnboardingAction>[2]) =>
      evaluateOnboardingAction(actor, ctx, action).allowed;
    return NextResponse.json({
      ok: true,
      stage: ctx.opportunity.etapa,
      isRdLead: ctx.isRdLead,
      migrationPending: ctx.migrationPending,
      onboarding: ctx.row
        ? {
            status: ctx.row.status,
            submissionCount: ctx.row.submission_count,
            submittedAt: ctx.row.submitted_at,
            returnedAt: ctx.row.returned_at,
            returnComment: ctx.row.return_comment,
            concludedAt: ctx.row.concluded_at,
            clienteId: ctx.row.cliente_id,
            grupoId: ctx.row.grupo_id,
            grupoNome: ctx.row.grupo_nome,
            viosReferencia: ctx.row.vios_referencia,
            updatedAt: ctx.row.updated_at,
          }
        : null,
      payload: ctx.payload,
      missing: listMissingOnboardingFields(ctx.payload),
      checklist: ctx.checklist,
      missingChecklist: listMissingChecklistItems(ctx.checklist),
      permissions: {
        editDraft: can("edit_draft"),
        submit: can("submit"),
        review: can("review"),
        returnToOwner: can("return"),
        conclude: can("conclude"),
      },
    });
  } catch (error) {
    return internalErrorResponse("onboarding/get", error, "Não foi possível carregar o cadastro.");
  }
}

const putSchema = z.object({
  payload: clientOnboardingPayloadSchema,
  expectedUpdatedAt: z.string().nullable().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "edit_draft");
    if (!result.ok) return result.response;
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Dados do cadastro inválidos." }, { status: 400 });
    }
    const saved = await saveOnboardingDraft(result.supabase, {
      ctx: result.ctx,
      actor: result.actor,
      payload: parsed.data.payload,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt ?? null,
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt, missing: listMissingOnboardingFields(parsed.data.payload) });
  } catch (error) {
    return internalErrorResponse("onboarding/put", error, "Não foi possível salvar o cadastro.");
  }
}
