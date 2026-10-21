import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { RECOVERY_EMAIL_COOLDOWN_SECONDS } from "@/lib/auth/password-recovery";
import {
  PASSWORD_RESET_EMAIL_SUBJECT,
  buildPasswordResetEmailHtml,
  buildPasswordResetLink,
  firstNameFrom,
} from "@/lib/auth/password-reset-email";
import { logServerError } from "@/lib/http/api-errors";
import { getPublicAppBaseUrl } from "@/lib/microsoft-mail/public-app-base-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendCrmNotificationEmail } from "@/modules/crm/application/services/send-lead-notification-email";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function findAuthUserByEmail(admin: AdminClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.trim().toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

function sentRecently(user: User, now = Date.now()): boolean {
  if (!user.recovery_sent_at) return false;
  return now - new Date(user.recovery_sent_at).getTime() < RECOVERY_EMAIL_COOLDOWN_SECONDS * 1000;
}

function isBanned(user: User, now = Date.now()): boolean {
  const until = (user as User & { banned_until?: string | null }).banned_until;
  return Boolean(until && new Date(until).getTime() > now);
}

/**
 * "Esqueci minha senha": gera o link de recuperação no Supabase (sem o e-mail padrão
 * dele) e envia o e-mail do escritório pelo Outlook do CRM. A resposta é a mesma
 * para e-mail cadastrado ou não; só uma falha no envio vira erro.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Informe um e-mail válido." }, { status: 400 });
  }
  const email = parsed.data.email;

  try {
    const admin = createSupabaseAdminClient();
    const user = await findAuthUserByEmail(admin, email);
    if (!user || isBanned(user) || sentRecently(user)) {
      return NextResponse.json({ ok: true });
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (linkError || !link.properties?.hashed_token) {
      throw linkError ?? new Error("generateLink sem hashed_token");
    }

    const { data: profile } = await admin
      .from("app_users")
      .select("full_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const appBaseUrl = getPublicAppBaseUrl();
    const html = buildPasswordResetEmailHtml({
      firstName: firstNameFrom(profile?.full_name ?? (user.user_metadata?.full_name as string | undefined)),
      link: buildPasswordResetLink(appBaseUrl, link.properties.hashed_token),
      appBaseUrl,
    });

    const sent = await sendCrmNotificationEmail(admin, { to: [email], subject: PASSWORD_RESET_EMAIL_SUBJECT, html });
    if (!sent.ok) throw new Error(sent.error ?? "Falha no envio pelo Outlook.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const ref = logServerError("auth/forgot-password", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos ou avise quem administra o CRM.",
        ref,
      },
      { status: 502 },
    );
  }
}
