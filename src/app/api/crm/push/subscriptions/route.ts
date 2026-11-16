import { NextResponse } from "next/server";
import { z } from "zod";

import { isPushConfigured } from "@/lib/crm/push/web-push-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Inscrição Web Push deste navegador (16/11/2026). POST grava/atualiza, DELETE remove. */

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((v) => v.startsWith("https://"), "Endpoint precisa ser https."),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ ok: true, configured: isPushConfigured() });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, error: "Push não configurado no servidor." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = subscriptionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Inscrição inválida." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();
  // O endpoint é único: o mesmo navegador com outro login passa a avisar o login novo.
  const { error } = await admin.from("crm_push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      updated_at: now,
      failure_count: 0,
    } as never,
    { onConflict: "endpoint" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Endpoint inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("crm_push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
