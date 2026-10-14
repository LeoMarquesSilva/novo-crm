import { NextRequest, NextResponse } from "next/server";
import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { z } from "zod";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";
import { resetNotificadoSingleAreaAndDispatch } from "@/lib/crm/proposta-solicitar-escopo-area";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  areaKey: z.string().min(1),
  targetAppUserIds: z.array(z.string().uuid()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: oportunidadeId } = await params;
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido (areaKey)." }, { status: 400 });
    }

    const auth = await requireLeadActionApi({ action: "proposal.manage" });
    if (!auth.ok) return auth.response;
    const profile = auth.profile;

    const supabase = createSupabaseAdminClient();
    const result = await resetNotificadoSingleAreaAndDispatch(
      supabase,
      oportunidadeId,
      parsed.data.areaKey,
      parsed.data.targetAppUserIds,
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
      title: `Proposta — escopo solicitado (${parsed.data.areaKey})`,
      detail: "Solicitação de preenchimento enviada ao gestor da área.",
      etapa: (oppRow?.etapa as import("@/modules/crm/domain/entities").OpportunityStage | undefined) ?? null,
      areaKey: parsed.data.areaKey,
      actorAppUserId: profile?.id ?? null,
      sourceId: `proposta-solicitar:${oportunidadeId}:${parsed.data.areaKey}:${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao solicitar escopo desta área.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
