import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { getDefaultLeadEmailTemplates } from "@/modules/crm/application/services/build-lead-notification-email";

const upsertRowSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  recipients: z.array(z.string().email("E-mail inválido")),
});

const upsertBodySchema = z.array(upsertRowSchema);

const templateRowSchema = z.object({
  variant: z.enum(["due", "sem_due"]),
  subject_template: z.string().min(1).max(500),
  html_template: z.string().min(1).max(512_000),
});

const putBodySchema = z.object({
  fixed: upsertBodySchema.optional(),
  templates: z.array(templateRowSchema).optional(),
});

type AppUserWithEmail = {
  full_name: string;
  area: string;
  email: string;
  avatar_url: string | null;
};

async function getUsersByArea(): Promise<AppUserWithEmail[]> {
  const supabase = createSupabaseAdminClient();

  const [{ data: appUsers }, { data: authData }] = await Promise.all([
    supabase
      .from("app_users")
      .select("full_name, area, auth_user_id, avatar_url")
      .not("area", "is", null),
    supabase.auth.admin.listUsers({ perPage: 200 }),
  ]);

  if (!appUsers) return [];

  const authMap = new Map<string, string>();
  for (const u of authData?.users ?? []) {
    if (u.email) authMap.set(u.id, u.email);
  }

  return appUsers
    .filter((u) => u.auth_user_id && authMap.has(u.auth_user_id))
    .map((u) => ({
      full_name: u.full_name ?? "",
      area: u.area ?? "",
      email: authMap.get(u.auth_user_id!)!,
      avatar_url: u.avatar_url ?? null,
    }))
    .sort((a, b) => a.area.localeCompare(b.area) || a.full_name.localeCompare(b.full_name));
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();

  const [fixedResult, usersByArea, tplResult, oauthResult] = await Promise.all([
    supabase
      .from("lead_email_notification_config")
      .select("id, key, label, recipients, updated_at")
      .like("key", "fixed:%")
      .order("key"),
    getUsersByArea(),
    supabase.from("lead_email_notification_template").select("variant, subject_template, html_template, updated_at"),
    supabase.from("lead_email_microsoft_oauth").select("user_email").eq("id", "default").maybeSingle(),
  ]);

  if (fixedResult.error) {
    return NextResponse.json({ ok: false, error: fixedResult.error.message }, { status: 500 });
  }
  if (tplResult.error) {
    return NextResponse.json({ ok: false, error: tplResult.error.message }, { status: 500 });
  }
  const oauthRow = oauthResult.error ? null : oauthResult.data;

  const defaults = getDefaultLeadEmailTemplates();
  const dbByVariant = new Map(
    (tplResult.data ?? []).map((r) => [r.variant as "due" | "sem_due", r]),
  );

  function tplBlock(variant: "due" | "sem_due") {
    const row = dbByVariant.get(variant);
    const def = defaults[variant];
    const fromDatabase = Boolean(row?.subject_template?.trim() && row?.html_template?.trim());
    return {
      variant,
      subject_template: fromDatabase ? row!.subject_template : def.subjectTemplate,
      html_template: fromDatabase ? row!.html_template : def.htmlTemplate,
      from_database: fromDatabase,
      updated_at: row?.updated_at ?? null,
    };
  }

  const delegatedConnected = Boolean(oauthRow);
  const delegatedEmail = oauthRow?.user_email?.trim() || null;
  const applicationReady =
    Boolean(process.env.MICROSOFT_TENANT_ID) &&
    Boolean(process.env.SHAREPOINT_CLIENT_ID) &&
    Boolean(process.env.SHAREPOINT_CLIENT_SECRET) &&
    Boolean(process.env.OUTLOOK_FROM_EMAIL);
  const outlookConfigured = delegatedConnected || applicationReady;
  const outlookFrom =
    delegatedConnected && delegatedEmail
      ? delegatedEmail
      : (process.env.OUTLOOK_FROM_EMAIL ?? null);
  const outlookMode: "delegated" | "application" | "none" = delegatedConnected
    ? "delegated"
    : applicationReady
      ? "application"
      : "none";

  return NextResponse.json({
    ok: true,
    fixed: fixedResult.data ?? [],
    usersByArea,
    outlook: {
      configured: outlookConfigured,
      from: outlookFrom,
      mode: outlookMode,
      delegated_connected: delegatedConnected,
      application_ready: applicationReady,
    },
    templates: {
      due: tplBlock("due"),
      sem_due: tplBlock("sem_due"),
    },
    template_defaults: defaults,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);

  // Compat: corpo antigo era só o array de fixed
  const normalized =
    Array.isArray(body) ? { fixed: body, templates: undefined } : body;

  const parsed = putBodySchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { fixed, templates } = parsed.data;
  if (!fixed?.length && !templates?.length) {
    return NextResponse.json(
      { ok: false, error: "Envie `fixed` e/ou `templates` para salvar." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  if (fixed && fixed.length > 0) {
    const rows = fixed
      .filter((r) => r.key.startsWith("fixed:"))
      .map((r) => ({
        key: r.key,
        label: r.label,
        recipients: r.recipients,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhuma linha fixed:* válida." }, { status: 400 });
    }

    const { error } = await supabase.from("lead_email_notification_config").upsert(rows, {
      onConflict: "key",
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  if (templates && templates.length > 0) {
    const rows = templates.map((t) => ({
      variant: t.variant,
      subject_template: t.subject_template,
      html_template: t.html_template,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("lead_email_notification_template").upsert(rows, {
      onConflict: "variant",
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
