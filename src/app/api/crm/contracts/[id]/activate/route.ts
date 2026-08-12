import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { ContractConfigurationError } from "@/modules/contracts/application/services/save-contract-configuration";
import { SupabaseContractRepository } from "@/modules/contracts/infrastructure/supabase-contract-repository";

const uuid = z.string().uuid();
const bodySchema = z.object({
  versionId: uuid,
  expectedVersionUpdatedAt: z.string().datetime({ offset: true }),
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
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
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

  try {
    const result = await new SupabaseContractRepository().activateVersionAtomic({
      actorId: auth.profile.id,
      contractId: params.data.id,
      versionId: body.data.versionId,
      expectedVersionUpdatedAt: body.data.expectedVersionUpdatedAt,
      advanceOpportunity: body.data.advanceOpportunity,
    });
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
