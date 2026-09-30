import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { getContractSioeUsage } from "@/modules/contracts/infrastructure/contract-queries";

export const maxDuration = 60;

const uuid = z.string().uuid();

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) {
    const code = auth.response.status === 401 ? "UNAUTHENTICATED" : "PROFILE_REQUIRED";
    return json({ ok: false, code, error: "Autenticação necessária." }, auth.response.status);
  }
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "view" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para ver o contrato." }, 403);
  }

  const params = z.object({ id: uuid }).safeParse(await context.params);
  if (!params.success) {
    return json({ ok: false, code: "INVALID_REQUEST", error: "Contrato inválido." }, 400);
  }

  try {
    const usage = await getContractSioeUsage(params.data.id);
    return json({ ok: true, usage }, 200);
  } catch (error) {
    console.error("Falha ao carregar uso SIOE do contrato", error);
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Falha ao carregar pastas e horas do SIOE.", usage: null }, 500);
  }
}
