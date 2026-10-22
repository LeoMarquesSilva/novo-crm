import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOfficialAvatarUrls } from "@/lib/official-photos/overlay";

export type AppUserProfile = Pick<
  Database["public"]["Tables"]["app_users"]["Row"],
  "id" | "auth_user_id" | "full_name" | "avatar_url" | "area" | "role"
>;

export type CurrentUserProfile = {
  user: User | null;
  profile: AppUserProfile | null;
};

/**
 * Sessão + perfil uma vez por request: layout e página do CRM chamam
 * `requireAuth` no mesmo render e dividem as mesmas consultas.
 */
const loadUserAndProfile = cache(async (): Promise<CurrentUserProfile> => {
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
});

export async function getCurrentUserProfile(
  options?: { officialAvatar?: boolean },
): Promise<CurrentUserProfile> {
  const { user, profile } = await loadUserAndProfile();

  if (!user || !profile) return { user, profile };

  if (options?.officialAvatar === false) {
    return { user, profile };
  }

  const officialUrl = (await resolveOfficialAvatarUrls([profile.id])).get(profile.id);

  return {
    user,
    profile: officialUrl ? { ...profile, avatar_url: officialUrl } : profile,
  };
}

/**
 * Sem `officialAvatar`, não consulta a API de fotos (até 2,5 s no caminho da
 * página): só o layout do CRM mostra o avatar; as páginas usam id e papel.
 */
export async function requireAuth(
  nextPath = "/crm",
  options?: { officialAvatar?: boolean },
): Promise<{
  user: User;
  profile: AppUserProfile;
}> {
  const { user, profile } = await getCurrentUserProfile({
    officialAvatar: options?.officialAvatar ?? false,
  });

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!profile) {
    redirect(
      `/login?reason=profile_missing&next=${encodeURIComponent(nextPath)}`,
    );
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
  const { user, profile } = await getCurrentUserProfile({ officialAvatar: false });

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
  | { ok: true; user: User; profile: AppUserProfile }
  | { ok: false; response: NextResponse }
> {
  const { user, profile } = await getCurrentUserProfile({ officialAvatar: false });

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 },
      ),
    };
  }

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Usuário autenticado sem perfil ativo no CRM. Solicite acesso a um administrador.",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, profile };
}
