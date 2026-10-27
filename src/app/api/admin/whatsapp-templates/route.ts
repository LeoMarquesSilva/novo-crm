import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/auth/server";
import {
  WHATSAPP_TEMPLATES_TABLE,
  isMissingTableError,
  loadWhatsappTemplateOverrides,
} from "@/lib/crm/whatsapp/template-store";
import { WHATSAPP_TEMPLATE_DEFS, WHATSAPP_TEMPLATE_KEYS, isWhatsappTemplateKey } from "@/lib/crm/whatsapp/templates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MIGRATION_PENDING =
  "A tabela dos modelos ainda não existe no banco (migration 20261022130000_whatsapp_message_templates). Os padrões continuam valendo; peça para aplicar a migration para salvar alterações.";

const putSchema = z.object({
  key: z.string().refine(isWhatsappTemplateKey, "Modelo desconhecido."),
  body: z.string().trim().min(1, "O texto não pode ficar vazio.").max(4000, "Texto longo demais (máx. 4.000 caracteres)."),
  enabled: z.boolean(),
});

// A tabela é nova e não está nos tipos gerados do Supabase.
function untypedAdminClient(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient;
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { rows, tableMissing, error } = await loadWhatsappTemplateOverrides(untypedAdminClient());
  if (error && !tableMissing) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const templates = WHATSAPP_TEMPLATE_KEYS.map((key) => {
    const def = WHATSAPP_TEMPLATE_DEFS[key];
    const row = rows.get(key);
    return {
      ...def,
      body: row?.body?.trim() ? row.body : def.defaultBody,
      enabled: row ? row.enabled !== false : def.defaultEnabled,
      fromDatabase: Boolean(row),
      updatedAt: row?.updated_at ?? null,
    };
  });

  return NextResponse.json({ ok: true, tableMissing, templates });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const { error } = await untypedAdminClient()
    .from(WHATSAPP_TEMPLATES_TABLE)
    .upsert(
      {
        key: parsed.data.key,
        body: parsed.data.body,
        enabled: parsed.data.enabled,
        updated_at: new Date().toISOString(),
        updated_by: auth.profile.id,
      },
      { onConflict: "key" },
    );
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, error: MIGRATION_PENDING, code: "MIGRATION_PENDING" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Restaurar o padrão: apaga a sobrescrita do modelo. */
export async function DELETE(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isWhatsappTemplateKey(key)) {
    return NextResponse.json({ ok: false, error: "Modelo desconhecido." }, { status: 400 });
  }

  const { error } = await untypedAdminClient().from(WHATSAPP_TEMPLATES_TABLE).delete().eq("key", key);
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, error: MIGRATION_PENDING, code: "MIGRATION_PENDING" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
