/**
 * Quem enviou cada documento D4Sign, para exibição.
 *
 * 1. Enviado pelo CRM → usuário do CRM (`sent_by_app_user_id`).
 * 2. Enviado direto na D4Sign → remetente lido do log do PDF
 *    (`sent_by_email`/`sent_by_name`); se o e-mail for de um usuário do CRM,
 *    usa nome e foto dele.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type D4SignSender = {
  full_name: string;
  avatar_url: string | null;
  /** `crm` = enviado pelo CRM; `d4sign` = lido do log do PDF. */
  source: "crm" | "d4sign";
};

type SenderRow = {
  sent_by_app_user_id: string | null;
  sent_by_email?: string | null;
  sent_by_name?: string | null;
};

export async function resolveD4SignSenders<T extends SenderRow>(
  rows: T[],
): Promise<(T & { sent_by: D4SignSender | null })[]> {
  const supabase = createSupabaseAdminClient();
  const appUserIds = [...new Set(rows.map((r) => r.sent_by_app_user_id).filter((id): id is string => Boolean(id)))];
  const emails = [
    ...new Set(
      rows
        .filter((r) => !r.sent_by_app_user_id && r.sent_by_email)
        .map((r) => (r.sent_by_email as string).toLowerCase()),
    ),
  ];

  const byId = new Map<string, { full_name: string; avatar_url: string | null }>();
  const byEmail = new Map<string, { full_name: string; avatar_url: string | null }>();

  if (appUserIds.length > 0) {
    const { data } = await supabase.from("app_users").select("id, full_name, avatar_url").in("id", appUserIds);
    for (const u of data ?? []) byId.set(u.id, { full_name: u.full_name, avatar_url: u.avatar_url ?? null });
  }

  if (emails.length > 0) {
    const { data: auth } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authIdByEmail = new Map(
      (auth?.users ?? [])
        .filter((u) => u.email && emails.includes(u.email.toLowerCase()))
        .map((u) => [u.id, (u.email as string).toLowerCase()] as const),
    );
    if (authIdByEmail.size > 0) {
      const { data } = await supabase
        .from("app_users")
        .select("auth_user_id, full_name, avatar_url")
        .in("auth_user_id", [...authIdByEmail.keys()]);
      for (const u of data ?? []) {
        const email = u.auth_user_id ? authIdByEmail.get(u.auth_user_id) : undefined;
        if (email) byEmail.set(email, { full_name: u.full_name, avatar_url: u.avatar_url ?? null });
      }
    }
  }

  return rows.map((r) => {
    const crm = r.sent_by_app_user_id ? byId.get(r.sent_by_app_user_id) : undefined;
    if (crm) return { ...r, sent_by: { ...crm, source: "crm" as const } };
    const email = r.sent_by_email?.toLowerCase();
    const known = email ? byEmail.get(email) : undefined;
    if (known) return { ...r, sent_by: { ...known, source: "d4sign" as const } };
    if (r.sent_by_name) {
      return { ...r, sent_by: { full_name: r.sent_by_name, avatar_url: null, source: "d4sign" as const } };
    }
    return { ...r, sent_by: null };
  });
}
