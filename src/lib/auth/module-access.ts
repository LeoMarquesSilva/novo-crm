import {
  canAccessModule,
  isCrmModule,
  type CrmModule,
} from "@/lib/auth/crm-access-policy";
import type { AppUserProfile } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Módulos liberados para o usuário (app_user_module_access). Leitura pela service
 * role: a tabela não tem policies, para ninguém se liberar pelo client do browser.
 */
export async function listUserModules(appUserId: string): Promise<CrmModule[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("app_user_module_access")
    .select("module")
    .eq("app_user_id", appUserId);
  if (error || !data) return [];
  return data.map((row) => row.module).filter(isCrmModule);
}

/** Admin não consulta a tabela: vê todos os módulos. */
export async function hasModuleAccess(
  profile: Pick<AppUserProfile, "id" | "role">,
  module: CrmModule,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  const modules = await listUserModules(profile.id);
  return canAccessModule({ role: profile.role, modules, module });
}

/**
 * Membros explícitos de um time/módulo (sem admin implícito), com o id de login
 * para notificações (`crm_in_app_notifications.user_id`).
 */
export async function listModuleMembers(
  module: CrmModule,
): Promise<{ appUserId: string; authUserId: string | null }[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("app_user_module_access")
    .select("app_user_id, app_users!app_user_module_access_app_user_id_fkey(auth_user_id)")
    .eq("module", module);
  if (error || !data) return [];
  return data.map((row) => {
    const joined = row.app_users as { auth_user_id: string | null } | { auth_user_id: string | null }[] | null;
    const authUserId = Array.isArray(joined) ? (joined[0]?.auth_user_id ?? null) : (joined?.auth_user_id ?? null);
    return { appUserId: row.app_user_id, authUserId };
  });
}
