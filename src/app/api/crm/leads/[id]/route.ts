import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchLeadDetail } from "@/lib/crm/patch-lead-detail";
import { requireAuthApi } from "@/lib/auth/server";

const patchBodySchema = z
  .object({
    intakeField: z.object({ key: z.string().min(1), value: z.string() }).optional(),
    rdField: z.object({ key: z.string().min(1), value: z.string() }).optional(),
    pipelineField: z
      .object({ fieldDefinitionId: z.string().uuid(), value: z.string() })
      .optional(),
  })
  .refine(
    (b) =>
      [b.intakeField, b.rdField, b.pipelineField].filter(Boolean).length === 1,
    { message: "Envie exatamente um bloco: intakeField, rdField ou pipelineField." },
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

    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
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
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao atualizar o lead.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!["admin", "comercial"].includes(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode excluir leads." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { error: deleteError } = await supabase.rpc(
      "delete_crm_lead_atomic",
      { p_opportunity_id: id },
    );
    if (deleteError) {
      const forbidden = deleteError.message.includes("LEAD_NOT_CREATED_IN_CRM");
      const notFound = deleteError.message.includes("OPPORTUNITY_NOT_FOUND");
      console.error("Falha na exclusão atômica do lead", deleteError);
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
    const message = error instanceof Error ? error.message : "Falha inesperada ao excluir lead.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
