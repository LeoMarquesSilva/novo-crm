import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { patchLeadDetail } from "@/lib/crm/patch-lead-detail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from("app_users")
      .select("id, role, area")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (parsed.data.pipelineField && !profile) {
      return NextResponse.json(
        { ok: false, error: "Utilizador sem perfil no CRM." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const result = await patchLeadDetail(supabase, id, parsed.data, {
      viewer: profile
        ? {
            authUserId: user.id,
            appUserId: profile.id,
            role: profile.role,
            appArea: profile.area,
          }
        : undefined,
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
    if (!auth.profile || !["admin", "comercial"].includes(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode excluir leads." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    const { data: intake, error: intakeFetchError } = await supabase
      .from("lead_intakes")
      .select("oportunidade_id")
      .eq("oportunidade_id", id)
      .maybeSingle();

    if (intakeFetchError) {
      return NextResponse.json({ ok: false, error: intakeFetchError.message }, { status: 500 });
    }

    if (!intake) {
      return NextResponse.json(
        {
          ok: false,
          error: "A exclusão é permitida apenas para leads criados no sistema.",
        },
        { status: 403 },
      );
    }

    const { error: deleteTransitionsError } = await supabase
      .from("transicoes_etapa")
      .delete()
      .eq("oportunidade_id", id);
    if (deleteTransitionsError) {
      return NextResponse.json({ ok: false, error: deleteTransitionsError.message }, { status: 500 });
    }

    const { error: deleteFieldValuesError } = await supabase
      .from("field_values")
      .delete()
      .eq("entity_name", "oportunidade")
      .eq("entity_record_id", id);
    if (deleteFieldValuesError) {
      return NextResponse.json({ ok: false, error: deleteFieldValuesError.message }, { status: 500 });
    }

    const { error: deleteReconciliationError } = await supabase
      .from("rd_deal_reconciliacao")
      .delete()
      .eq("oportunidade_id", id);
    if (deleteReconciliationError) {
      return NextResponse.json(
        { ok: false, error: deleteReconciliationError.message },
        { status: 500 },
      );
    }

    const { error: deleteIntakeError } = await supabase
      .from("lead_intakes")
      .delete()
      .eq("oportunidade_id", id);
    if (deleteIntakeError) {
      return NextResponse.json({ ok: false, error: deleteIntakeError.message }, { status: 500 });
    }

    const { error: deleteOpportunityError } = await supabase.from("oportunidades").delete().eq("id", id);
    if (deleteOpportunityError) {
      return NextResponse.json({ ok: false, error: deleteOpportunityError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao excluir lead.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
