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
