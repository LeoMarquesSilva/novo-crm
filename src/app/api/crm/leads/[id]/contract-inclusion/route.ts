/**
 * POST /api/crm/leads/[id]/contract-inclusion — o Financeiro inclui o contrato do lead no
 * gerenciamento de contratos (Inclusão no Faturamento): rascunho pré-preenchido com o
 * cadastro do cliente, a proposta e a leitura por IA do PDF assinado.
 * Body: { mode?: "initial" | "reread_pdf" }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { canConfigureContract } from "@/lib/auth/crm-access-policy";
import { requireCrmActorApi } from "@/lib/auth/crm-actor";
import { includeLeadContract } from "@/lib/crm/contract-inclusion/include-lead-contract";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Download do PDF + leitura pela IA (até 90 s) cabem aqui. */
export const maxDuration = 300;

const bodySchema = z.object({ mode: z.enum(["initial", "reread_pdf"]).default("initial") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireCrmActorApi();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const opportunityId = decodeURIComponent(id);
    const parsed = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: opp } = await supabase.from("oportunidades").select("etapa").eq("id", opportunityId).maybeSingle();
    const allowed = canConfigureContract({
      role: auth.actor.role,
      contract: {
        opportunityId,
        opportunityStage: (opp as { etapa: string } | null)?.etapa ?? null,
        versionNumber: 1,
        versionStatus: "rascunho",
      },
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "A inclusão no gerenciamento de contratos é do Financeiro, da controladoria ou do admin." },
        { status: 403 },
      );
    }

    const result = await includeLeadContract(supabase, { opportunityId, actor: auth.actor, mode: parsed.data.mode });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return internalErrorResponse("contract-inclusion", error, "Não foi possível incluir o contrato no gerenciamento.");
  }
}
