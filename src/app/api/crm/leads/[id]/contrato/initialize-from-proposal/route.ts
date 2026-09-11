import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { initializeContractFromProposal } from "@/lib/crm/contract-engine/initialize-from-proposal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode iniciar o contrato a partir da proposta." },
        { status: 403 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const oportunidadeId = decodeURIComponent((await params).id);
    const supabase = createSupabaseAdminClient();
    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const result = await initializeContractFromProposal({
      supabase,
      oportunidadeId,
      createdBy: auth.profile.id,
      force: parsed.data.force,
    });

    return NextResponse.json({
      ok: true,
      reused: result.reused,
      data: result.build,
      snapshot: result.snapshot,
      instanceUpdatedAt:
        typeof result.instance.updated_at === "string" ? result.instance.updated_at : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao iniciar contrato a partir da proposta.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
