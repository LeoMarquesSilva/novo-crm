import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";
import { resetNotificadoAndDispatchOtherPendingAreas } from "@/lib/crm/proposta-notificar-outras-areas";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    targetsByArea: z.record(z.string(), z.array(z.string().uuid())).optional(),
  })
  .optional();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: oportunidadeId } = await params;
    const json = await request.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
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
      .select("id, area, full_name, avatar_url")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const area = profile?.area != null ? String(profile.area).trim() : "";
    if (!area) {
      return NextResponse.json(
        { ok: false, error: "Perfil sem área definida; só gestores com área podem usar esta ação." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const result = await resetNotificadoAndDispatchOtherPendingAreas(
      supabase,
      oportunidadeId,
      area,
      parsed.data?.targetsByArea,
      { originado_por: actorFromAppUserRow(profile) },
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }

    const { data: oppRow } = await supabase
      .from("oportunidades")
      .select("etapa")
      .eq("id", oportunidadeId)
      .maybeSingle();

    await recordLeadActivityEvent(supabase, {
      oportunidadeId,
      kind: "proposta_escopo_solicitado",
      title: `Proposta — notificação enviada (${area})`,
      detail: "Gestor notificou outras áreas pendentes de escopo.",
      etapa: (oppRow?.etapa as import("@/modules/crm/domain/entities").OpportunityStage | undefined) ?? null,
      areaKey: area,
      actorAppUserId: profile?.id ?? null,
      sourceId: `proposta-notify-areas:${oportunidadeId}:${area}:${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao notificar outras áreas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
