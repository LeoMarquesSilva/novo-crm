import type { NextResponse } from "next/server";

import { requireCrmActorApi, type CrmActorApiResult } from "@/lib/auth/crm-actor";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { RdMigrationActor } from "./service";

type Ok = Extract<CrmActorApiResult, { ok: true }> & {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  migrationActor: RdMigrationActor;
};

/** Sessão + ator da migração (admin vê e converte tudo; os demais, os próprios negócios). */
export async function requireRdMigrationActor(): Promise<Ok | { ok: false; response: NextResponse }> {
  const auth = await requireCrmActorApi();
  if (!auth.ok) return auth;
  return {
    ...auth,
    supabase: createSupabaseAdminClient(),
    migrationActor: {
      appUserId: auth.profile.id,
      isAdmin: auth.profile.role === "admin",
      email: auth.user.email?.trim().toLowerCase() ?? null,
    },
  };
}
