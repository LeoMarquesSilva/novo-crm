import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability, canConfigureContract } from "@/lib/auth/crm-access-policy";
import { loadContractConfigureContext } from "@/modules/contracts/infrastructure/contract-configure-context";
import { requireAuthApi } from "@/lib/auth/server";
import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { isIsoTimestamp } from "@/lib/crm/timestamps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ContractConfigurationError } from "@/modules/contracts/application/services/save-contract-configuration";
import { SupabaseContractRepository } from "@/modules/contracts/infrastructure/supabase-contract-repository";

const uuid = z.string().uuid();
const bodySchema = z.object({
  versionId: uuid,
  expectedVersionUpdatedAt: z.string().refine(isIsoTimestamp, "Instante ISO-8601 inválido."),
  advanceOpportunity: z.boolean(),
});

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) {
    const code = auth.response.status === 401 ? "UNAUTHENTICATED" : "PROFILE_REQUIRED";
    return json({ ok: false, code, error: "Autenticação necessária.", issues: [] }, auth.response.status);
  }
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" }) && auth.profile.role !== "financeiro") {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para ativar contratos.", issues: [] }, 403);
  }

  const params = z.object({ id: uuid }).safeParse(await context.params);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST", error: "Corpo JSON inválido.", issues: [] }, 400);
  }
  const body = bodySchema.safeParse(raw);
  if (!params.success || !body.success) {
    return json({
      ok: false,
      code: "INVALID_REQUEST",
      error: "Requisição inválida.",
      issues: [...(params.success ? [] : params.error.issues), ...(body.success ? [] : body.error.issues)],
    }, 400);
  }

  if (
    !canConfigureContract({
      role: auth.profile.role,
      contract: auth.profile.role === "financeiro" ? await loadContractConfigureContext(params.data.id, body.data.versionId) : null,
    })
  ) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para configurar este contrato.", issues: [] }, 403);
  }

  try {
    const result = await new SupabaseContractRepository().activateVersionAtomic({
      actorId: auth.profile.id,
      contractId: params.data.id,
      versionId: body.data.versionId,
      expectedVersionUpdatedAt: body.data.expectedVersionUpdatedAt,
      advanceOpportunity: body.data.advanceOpportunity,
    });
    if (result.opportunityId && result.opportunityTransitionId) {
      await recordContractActivation({
        opportunityId: result.opportunityId,
        transitionId: result.opportunityTransitionId,
        contractId: result.contractId,
        actorAppUserId: auth.profile.id,
      });
    }
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof ContractConfigurationError) {
      const status = error.code === "CONTRACT_CONFIGURATION_INVALID" ? 422
        : error.code === "CONTRACT_NOT_FOUND" ? 404
        : error.code === "CONTRACT_FORBIDDEN" ? 403
        : 409;
      return json({ ok: false, code: error.code, error: error.message, issues: error.issues ?? [] }, status);
    }
    console.error("Falha ao ativar contrato", error);
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Falha ao ativar contrato.", issues: [] }, 500);
  }
}

/** Contrato ativado com o lead em Inclusão no Faturamento: histórico e aviso à equipe do lead. */
async function recordContractActivation(input: {
  opportunityId: string;
  transitionId: string;
  contractId: string;
  actorAppUserId: string;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: input.opportunityId,
      kind: "contrato_ativado",
      title: "Contrato ativado no gerenciamento de contratos",
      detail: "Regras de cobrança configuradas pelo Financeiro. Lead em Boas-vindas.",
      etapa: "boas_vindas",
      actorAppUserId: input.actorAppUserId,
      sourceId: `contract-activated:${input.contractId}`,
      metadata: { contract_id: input.contractId },
    });
    await recordLeadActivityEvent(supabase, {
      oportunidadeId: input.opportunityId,
      kind: "etapa_alterada",
      title: "Etapa alterada",
      detail: "inclusao_faturamento → boas_vindas",
      etapa: "boas_vindas",
      actorAppUserId: input.actorAppUserId,
      sourceId: `trans:${input.transitionId}`,
      metadata: { from: "inclusao_faturamento", to: "boas_vindas", trigger: "contract_activation" },
    });
    const { data: opp } = await supabase
      .from("oportunidades")
      .select("solicitante_nome")
      .eq("id", input.opportunityId)
      .maybeSingle();
    await notifyAudience(
      supabase,
      { leadTeamOf: input.opportunityId },
      {
        tipo: "contrato_ativado",
        title: `Contrato ativado — ${(opp as { solicitante_nome?: string } | null)?.solicitante_nome ?? "Lead"}`,
        preview: "O Financeiro incluiu o contrato no faturamento. O lead está em Boas-vindas.",
        path: `/crm/leads/${encodeURIComponent(input.opportunityId)}`,
        idempotencyKey: `contrato-ativado:${input.contractId}`,
        extra: { oportunidade_id: input.opportunityId, contrato_id: input.contractId },
      },
    );
  } catch (error) {
    console.warn("[contracts/activate] histórico/aviso da ativação não gravado", error);
  }
}
