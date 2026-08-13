import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  ContractConfigurationError,
  validateContractVersionAction,
  type VersionAction,
} from "@/modules/contracts/application/services/save-contract-configuration";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clone_draft"), sourceVersionId: uuid, effectiveFrom: date, addendumId: uuid.optional() }),
  z.object({ action: z.literal("suspend_contract"), reason: z.string() }),
  z.object({ action: z.literal("resume_contract"), reason: z.string() }),
  z.object({ action: z.literal("end_contract"), endedAt: date, reason: z.string() }),
]);

const json = (body: object, status: number) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (auth.profile.role !== "admin" && auth.profile.role !== "controladoria") {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para versionar contratos." }, 403);
  }

  const params = z.object({ id: uuid }).safeParse(await context.params);
  let raw: unknown;
  try { raw = await request.json(); } catch { raw = null; }
  const body = actionSchema.safeParse(raw);
  if (!params.success || !body.success) {
    return json({ ok: false, code: "INVALID_REQUEST", error: "Ação de versão inválida." }, 400);
  }

  try {
    const action = validateContractVersionAction(body.data as VersionAction);
    const { data, error } = await createSupabaseAdminClient().rpc("manage_contract_version_atomic", {
      p_contract_id: params.data.id,
      p_actor_id: auth.profile.id,
      p_action: action as unknown as Json,
      p_now: new Date().toISOString(),
    });
    if (error) throw error;
    return json({ ok: true, result: data }, 200);
  } catch (error) {
    if (error instanceof ContractConfigurationError) {
      return json({ ok: false, code: error.code, error: error.message }, 422);
    }
    const pg = error as { code?: string; message?: string };
    if (pg.code === "23P01" || pg.message?.includes("CONTRACT_VERSION_OVERLAP")) {
      return json({ ok: false, code: "CONTRACT_VERSION_OVERLAP", error: "Já existe uma versão cobrindo a vigência informada." }, 409);
    }
    if (pg.code === "P0002") return json({ ok: false, code: pg.message ?? "CONTRACT_NOT_FOUND", error: "Contrato, versão ou aditivo não encontrado." }, 404);
    if (pg.code === "22023") return json({ ok: false, code: pg.message ?? "CONTRACT_VERSION_ACTION_INVALID", error: "Não foi possível aplicar a alteração solicitada." }, 422);
    console.error("Falha ao versionar contrato", error);
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Falha ao versionar contrato." }, 500);
  }
}
