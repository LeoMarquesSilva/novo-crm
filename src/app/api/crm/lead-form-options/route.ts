import { NextResponse } from "next/server";

import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const [{ data: users, error: usersError }, authUsersResult, { data: indicators, error: indicatorsError }] =
      await Promise.all([
        supabase
          .from("app_users")
          .select("id, full_name, auth_user_id, avatar_url")
          .order("full_name", { ascending: true }),
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase
          .from("indicadores")
          .select("nome")
          .eq("status", "aprovado")
          .order("nome", { ascending: true }),
      ]);

    if (usersError) {
      return NextResponse.json({ ok: false, error: usersError.message }, { status: 500 });
    }
    if (authUsersResult.error) {
      return NextResponse.json(
        { ok: false, error: authUsersResult.error.message },
        { status: 500 },
      );
    }
    if (indicatorsError) {
      return NextResponse.json(
        { ok: false, error: indicatorsError.message },
        { status: 500 },
      );
    }

    const authEmailById = new Map<string, string>();
    for (const authUser of authUsersResult.data.users) {
      if (authUser.id && authUser.email) {
        authEmailById.set(authUser.id, authUser.email.trim().toLowerCase());
      }
    }

    const systemUsers = (users ?? [])
      .map((user) => {
        const email = authEmailById.get(user.auth_user_id) ?? null;
        if (!email) return null;

        return {
          id: user.id,
          name: user.full_name,
          email,
          avatarUrl:
            user.avatar_url ||
            `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(
              user.full_name,
            )}`,
        };
      })
      .filter((user): user is NonNullable<typeof user> => user !== null);

    const profile = auth.profile;
    const currentUser = profile
      ? systemUsers.find((user) => user.id === profile.id) ?? {
          id: profile.id,
          name: profile.full_name,
          email: auth.user.email?.trim().toLowerCase() ?? "",
          avatarUrl:
            profile.avatar_url ||
            `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(
              profile.full_name,
            )}`,
        }
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        currentUser,
        systemUsers,
        approvedIndicators: (indicators ?? []).map((item) => item.nome),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha inesperada ao carregar opções do cadastro.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
