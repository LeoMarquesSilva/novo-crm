import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchLeadDetail } from "@/lib/crm/patch-lead-detail";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { evaluateLeadAction } from "@/lib/auth/crm-access-policy";
import { forbiddenResponse, requireCrmActorApi, requireLeadActionApi } from "@/lib/auth/crm-actor";
import { internalErrorResponse, logServerError } from "@/lib/http/api-errors";

const patchBodySchema = z
  .object({
    intakeField: z.object({ key: z.string().min(1), value: z.string() }).optional(),
    rdField: z.object({ key: z.string().min(1), value: z.string() }).optional(),
    pipelineField: z
      .object({ fieldDefinitionId: z.string().uuid(), value: z.string() })
      .optional(),
    closingStatus: z
      .object({ value: z.enum(["perdido"]).nullable() })
      .optional(),
  })
  .refine(
    (b) =>
      [b.intakeField, b.rdField, b.pipelineField, b.closingStatus].filter(Boolean).length === 1,
    { message: "Envie exatamente um bloco de atualização." },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const json = await request.json();
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().formErrors.join("; ") || "Payload inválido" },
        { status: 400 },
      );
    }

    const auth = await requireCrmActorApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    if (parsed.data.closingStatus) {
      const decision = evaluateLeadAction(auth.actor, { action: "lead.close" });
      if (!decision.allowed) return forbiddenResponse(decision);

      const { data: current, error: currentError } = await supabase
        .from("oportunidades")
        .select("encerramento, etapa")
        .eq("id", id)
        .maybeSingle();

      if (currentError) {
        return internalErrorResponse("leads/close/read", currentError);
      }
      if (!current) {
        return NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 });
      }
      if (current.encerramento === "ganho") {
        return NextResponse.json(
          { ok: false, error: "A venda já foi encerrada como ganha (contrato assinado)." },
          { status: 409 },
        );
      }

      const nextStatus = parsed.data.closingStatus.value;
      if (current.encerramento !== nextStatus) {
        const { error: updateError } = await supabase
          .from("oportunidades")
          .update({
            encerramento: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) {
          return internalErrorResponse("leads/close/update", updateError);
        }

        await recordLeadActivityEvent(supabase, {
          oportunidadeId: id,
          kind: nextStatus === "perdido" ? "lead_perdido" : "lead_reaberto",
          title: nextStatus === "perdido" ? "Lead marcado como perdido" : "Lead reaberto",
          detail:
            nextStatus === "perdido"
              ? "A negociação foi encerrada como perdida."
              : "A negociação voltou a ficar ativa no funil.",
          etapa: current.etapa,
          actorAppUserId: auth.profile.id,
          metadata: {
            from: current.encerramento,
            to: nextStatus,
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    const result = await patchLeadDetail(supabase, id, parsed.data, {
      viewer: {
        authUserId: auth.user.id,
        appUserId: auth.profile.id,
        role: auth.profile.role,
        appArea: auth.profile.area,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalErrorResponse("leads/patch", error, "Falha inesperada ao atualizar o lead.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireLeadActionApi({ action: "lead.delete" });
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { error: deleteError } = await supabase.rpc(
      "delete_crm_lead_atomic",
      { p_opportunity_id: id },
    );
    if (deleteError) {
      const forbidden = deleteError.message.includes("LEAD_NOT_CREATED_IN_CRM");
      const notFound = deleteError.message.includes("OPPORTUNITY_NOT_FOUND");
      logServerError("leads/delete", deleteError, { id });
      return NextResponse.json(
        {
          ok: false,
          error: forbidden
            ? "A exclusão é permitida apenas para leads criados no sistema."
            : notFound
              ? "Lead não encontrado."
              : "Não foi possível excluir o lead.",
        },
        { status: forbidden ? 403 : notFound ? 404 : 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalErrorResponse("leads/delete", error, "Falha inesperada ao excluir lead.");
  }
}
