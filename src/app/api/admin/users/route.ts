import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createUserSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).default("123456"),
  role: z.enum(["admin", "comercial", "controladoria", "financeiro"]).default("comercial"),
  area: z.string().optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data: users, error } = await supabase
      .from("app_users")
      .select("id, auth_user_id, full_name, role, area, avatar_url, created_at")
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const emailByAuthId = new Map(
      (authUsers.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null]),
    );

    const data = (users ?? []).map((user) => ({
      ...user,
      email: emailByAuthId.get(user.auth_user_id) ?? null,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = createUserSchema.parse(body);

    const supabase = createSupabaseAdminClient();

    // Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.full_name },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Cria perfil em app_users
    const { data: appUser, error: profileError } = await supabase
      .from("app_users")
      .insert({
        auth_user_id: authData.user.id,
        full_name: parsed.full_name,
        role: parsed.role,
        area: parsed.area || null,
        avatar_url: parsed.avatar_url || null,
      })
      .select()
      .single();

    if (profileError) {
      // Rollback: remove o auth user criado
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ data: { ...appUser, email: parsed.email } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
