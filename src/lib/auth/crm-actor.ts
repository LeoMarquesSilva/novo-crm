import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import {
  evaluateLeadAction,
  toCrmActor,
  type CrmActor,
  type LeadActionInput,
  type PolicyDecision,
} from "@/lib/auth/crm-access-policy";
import { listUserModules } from "@/lib/auth/module-access";
import { requireAuthApi, type AppUserProfile } from "@/lib/auth/server";

export type CrmActorApiResult =
  | { ok: true; user: User; profile: AppUserProfile; actor: CrmActor }
  | { ok: false; response: NextResponse };

/** Sessão + perfil + times liberados, no formato que a política (`evaluateLeadAction`) usa. */
export async function requireCrmActorApi(): Promise<CrmActorApiResult> {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth;
  const modules = auth.profile.role === "admin" ? [] : await listUserModules(auth.profile.id);
  const actor = toCrmActor({
    appUserId: auth.profile.id,
    role: auth.profile.role,
    area: auth.profile.area,
    email: auth.user.email ?? null,
    modules,
  });
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Perfil sem papel válido no CRM.", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user: auth.user, profile: auth.profile, actor };
}

export function forbiddenResponse(decision: Extract<PolicyDecision, { allowed: false }>): NextResponse {
  if (decision.code === "use_dedicated_action") {
    return NextResponse.json(
      {
        ok: false,
        error: decision.reason,
        code: "USE_DEDICATED_ACTION",
        ...(decision.actionKind ? { actionKind: decision.actionKind } : {}),
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: false, error: decision.reason, code: "FORBIDDEN" }, { status: 403 });
}

/** Para ações que não dependem de dados do lead (criar lead, operar D4Sign...). */
export async function requireLeadActionApi(input: LeadActionInput): Promise<CrmActorApiResult> {
  const auth = await requireCrmActorApi();
  if (!auth.ok) return auth;
  const decision = evaluateLeadAction(auth.actor, input);
  if (!decision.allowed) return { ok: false, response: forbiddenResponse(decision) };
  return auth;
}
