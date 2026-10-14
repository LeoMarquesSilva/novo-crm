import { NextResponse } from "next/server";

import { forbiddenResponse, requireCrmActorApi, type CrmActorApiResult } from "@/lib/auth/crm-actor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { loadOnboardingContext, type OnboardingContext } from "./load-onboarding-context";
import { evaluateOnboardingAction, type OnboardingAction } from "./service";

type Ok = Extract<CrmActorApiResult, { ok: true }> & {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  ctx: OnboardingContext;
};

/** Sessão + lead + cadastro; com `action`, já confere a permissão pela matriz de etapas. */
export async function requireOnboardingContext(
  params: Promise<{ id: string }>,
  action?: OnboardingAction,
): Promise<Ok | { ok: false; response: NextResponse }> {
  const auth = await requireCrmActorApi();
  if (!auth.ok) return auth;
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const ctx = await loadOnboardingContext(supabase, decodeURIComponent(id));
  if (!ctx) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Lead não encontrado." }, { status: 404 }) };
  }
  if (action) {
    const decision = evaluateOnboardingAction(auth.actor, ctx, action);
    if (!decision.allowed) return { ok: false, response: forbiddenResponse(decision) };
  }
  return { ...auth, supabase, ctx };
}
