import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppUserProfile = Pick<
  Database["public"]["Tables"]["app_users"]["Row"],
  "id" | "auth_user_id" | "full_name" | "avatar_url" | "area" | "role"
>;

export type CurrentUserProfile = {
  user: User | null;
  profile: AppUserProfile | null;
};

export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("app_users")
    .select("id, auth_user_id, full_name, avatar_url, area, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return { user, profile: profile ?? null };
}

export async function requireAuth(nextPath = "/crm"): Promise<{
  user: User;
  profile: AppUserProfile | null;
}> {
  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return { user, profile };
}

export async function requireAdmin(nextPath = "/crm"): Promise<{
  user: User;
  profile: AppUserProfile;
}> {
  const { user, profile } = await requireAuth(nextPath);

  if (!profile || profile.role !== "admin") {
    redirect("/crm");
  }

  return { user, profile };
}

export async function requireAdminApi(): Promise<
  | { ok: true; user: User; profile: AppUserProfile }
  | { ok: false; response: NextResponse }
> {
  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      ),
    };
  }

  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Apenas administradores podem acessar este recurso." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, profile };
}

export async function requireAuthApi(): Promise<
  | { ok: true; user: User; profile: AppUserProfile | null }
  | { ok: false; response: NextResponse }
> {
  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      ),
    };
  }

  return { ok: true, user, profile };
}
