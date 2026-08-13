import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ opportunityId: z.string().uuid() });

function json(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "ensure_draft" })) {
    return json(
      { ok: false, error: "Sem permissão para criar o cadastro-base contratual." },
      403,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Corpo JSON inválido." }, 400);
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return json(
      { ok: false, error: "Oportunidade inválida.", details: body.error.flatten() },
      400,
    );
  }

  const { data: contractId, error } = await createSupabaseAdminClient().rpc(
    "ensure_contract_draft_for_opportunity",
    {
      p_opportunity_id: body.data.opportunityId,
      p_now: new Date().toISOString(),
    },
  );
  if (error) {
    const notFound = error.message.includes("OPPORTUNITY_NOT_FOUND");
    return json(
      {
        ok: false,
        error: notFound
          ? "Oportunidade não encontrada."
          : "Não foi possível criar o cadastro-base contratual.",
      },
      notFound ? 404 : 500,
    );
  }

  return json({ ok: true, contractId }, 200);
}
