/**
 * POST /api/crm/leads/[id]/onboarding/conclude — Operações Legais conclui: cria/vincula
 * cliente, grupo e contatos. O lead fica em Cadastro de Novo Cliente até o responsável enviar
 * os dados do faturamento (sem a migration 20261027120000, vai direto para Inclusão).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import { concludeOnboarding } from "@/lib/crm/client-onboarding/service";
import { internalErrorResponse } from "@/lib/http/api-errors";
import { opsChecklistSchema } from "@/modules/crm/domain/client-onboarding";

const bodySchema = z.object({
  checklist: opsChecklistSchema,
  /** Grupo existente escolhido; sem ele, cria/acha pelo nome do checklist. */
  grupoId: z.string().uuid().nullable().optional(),
  /** Cliente existente escolhido; sem ele, acha pelo CPF/CNPJ ou cria. */
  clienteId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "conclude");
    if (!result.ok) return result.response;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
    const concluded = await concludeOnboarding(result.supabase, {
      ctx: result.ctx,
      actor: result.actor,
      checklist: parsed.data.checklist,
      grupoId: parsed.data.grupoId ?? null,
      clienteId: parsed.data.clienteId ?? null,
    });
    return NextResponse.json({ ok: true, ...concluded });
  } catch (error) {
    return internalErrorResponse("onboarding/conclude", error, "Não foi possível concluir o cadastro.");
  }
}
