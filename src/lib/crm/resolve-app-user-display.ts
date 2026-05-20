import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedAppUser = {
  fullName: string;
  avatarUrl: string | null;
};

/** Formato UUID (qualquer variante). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(String(s).trim());
}

/**
 * Resolve `app_users.id` → nome/avatar para exibição na ficha (batch).
 */
/** Iniciais para fallback do avatar (2 letras). */
export function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export async function fetchAppUsersByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, ResolvedAppUser>> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, avatar_url")
    .in("id", unique);

  if (error || !data) return new Map();

  return new Map(
    data.map((u) => [
      u.id,
      { fullName: u.full_name, avatarUrl: u.avatar_url },
    ]),
  );
}

function normalizeLookupEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve e-mails de Auth (`auth.users`) para `app_users` (nome + avatar), como em GET `/api/admin/users`.
 */
export async function fetchAppUsersByEmails(
  supabase: SupabaseClient,
  emails: string[],
): Promise<Map<string, ResolvedAppUser>> {
  const unique = [
    ...new Set(
      emails
        .map((e) => normalizeLookupEmail(e))
        .filter((e) => e.includes("@")),
    ),
  ];
  if (unique.length === 0) return new Map();

  const { data: users, error } = await supabase
    .from("app_users")
    .select("id, auth_user_id, full_name, avatar_url")
    .order("full_name", { ascending: true });

  if (error || !users?.length) return new Map();

  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authErr) return new Map();

  const emailByAuthId = new Map(
    (authList.users ?? []).map((u) => [u.id, (u.email ?? "").trim().toLowerCase()]),
  );

  const out = new Map<string, ResolvedAppUser>();
  for (const u of users) {
    const em = emailByAuthId.get(u.auth_user_id);
    if (!em) continue;
    out.set(em, { fullName: u.full_name, avatarUrl: u.avatar_url });
  }
  return out;
}

/** Obtém `ResolvedAppUser` para um e-mail concreto (lookup já normalizado). */
export function resolvedUserFromEmailMap(
  map: Map<string, ResolvedAppUser>,
  email: string,
): ResolvedAppUser | undefined {
  return map.get(normalizeLookupEmail(email));
}
