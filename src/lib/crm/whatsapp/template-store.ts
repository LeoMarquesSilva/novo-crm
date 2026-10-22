import type { SupabaseClient } from "@supabase/supabase-js";

import {
  WHATSAPP_TEMPLATE_DEFS,
  renderWhatsappTemplate,
  type WhatsappTemplateKey,
  type WhatsappTemplateValues,
} from "@/lib/crm/whatsapp/templates";

/** Sobrescrita dos modelos (migration `20261022130000_whatsapp_message_templates.sql`). */
export const WHATSAPP_TEMPLATES_TABLE = "whatsapp_message_templates";

export type StoredWhatsappTemplate = {
  key: string;
  body: string;
  enabled: boolean;
  updated_at: string | null;
};

/** Tabela ainda não criada no banco (migration pendente): o CRM segue com os padrões do código. */
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache/i.test(error.message ?? "");
}

export async function loadWhatsappTemplateOverrides(
  supabase: SupabaseClient,
): Promise<{ rows: Map<string, StoredWhatsappTemplate>; tableMissing: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from(WHATSAPP_TEMPLATES_TABLE)
    .select("key, body, enabled, updated_at");
  if (error) {
    return { rows: new Map(), tableMissing: isMissingTableError(error), error: error.message };
  }
  const rows = new Map<string, StoredWhatsappTemplate>();
  for (const row of (data ?? []) as StoredWhatsappTemplate[]) rows.set(row.key, row);
  return { rows, tableMissing: false, error: null };
}

/** Texto e ligado/desligado em vigor: o do banco quando existe, senão o padrão do código. */
export async function resolveWhatsappTemplate(
  supabase: SupabaseClient,
  key: WhatsappTemplateKey,
): Promise<{ body: string; enabled: boolean }> {
  const def = WHATSAPP_TEMPLATE_DEFS[key];
  const { data, error } = await supabase
    .from(WHATSAPP_TEMPLATES_TABLE)
    .select("body, enabled")
    .eq("key", key)
    .maybeSingle();
  const row = error ? null : (data as { body: string | null; enabled: boolean | null } | null);
  return {
    body: row?.body?.trim() ? row.body : def.defaultBody,
    enabled: row ? row.enabled !== false : def.defaultEnabled,
  };
}

/** Mensagem pronta para enviar, ou `null` quando o modelo está desligado. */
export async function buildWhatsappMessage(
  supabase: SupabaseClient,
  key: WhatsappTemplateKey,
  values: WhatsappTemplateValues,
): Promise<string | null> {
  const template = await resolveWhatsappTemplate(supabase, key);
  if (!template.enabled) return null;
  const text = renderWhatsappTemplate(template.body, values);
  return text || null;
}
