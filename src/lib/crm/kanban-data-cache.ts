import { revalidateTag, unstable_cache } from "next/cache";

import { summarizeRdReconciliationRows, type RdLeadSummary } from "@/lib/crm/rd-reconciliation-summary";
import { overlayOfficialAvatars } from "@/lib/official-photos/overlay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Dados do kanban que mudam pouco ficam no cache do Next, fora do caminho de cada request:
 * - snapshot do RD: muda no import diário, no import manual e no webhook do RD;
 * - usuários (nome, e-mail do auth, foto oficial): mudam em Usuários e no Perfil.
 */
export const RD_RECONCILIATION_CACHE_TAG = "crm:rd-reconciliacao";
export const CRM_USER_DIRECTORY_CACHE_TAG = "crm:user-directory";

async function loadRdReconciliationSummaries(): Promise<Record<string, RdLeadSummary>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("rd_deal_reconciliacao")
    .select("oportunidade_id, detalhes, reconciled_at")
    .not("oportunidade_id", "is", null)
    .order("reconciled_at", { ascending: false });
  if (error) throw error;
  return summarizeRdReconciliationRows(data ?? []);
}

export const getRdReconciliationSummaries = unstable_cache(
  loadRdReconciliationSummaries,
  ["crm-rd-reconciliacao-summary-v1"],
  { revalidate: 60 * 60 * 6, tags: [RD_RECONCILIATION_CACHE_TAG] },
);

export type CrmDirectoryUser = {
  id: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
};

async function loadCrmUserDirectory(): Promise<CrmDirectoryUser[]> {
  const supabase = createSupabaseAdminClient();
  const [{ data: usersRows, error: usersError }, authUsersResult] = await Promise.all([
    supabase.from("app_users").select("id, full_name, auth_user_id, avatar_url"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (usersError) throw usersError;
  if (authUsersResult.error) throw authUsersResult.error;

  const authEmailById = new Map<string, string>();
  for (const authUser of authUsersResult.data.users) {
    if (authUser.id && authUser.email) authEmailById.set(authUser.id, authUser.email.toLowerCase());
  }
  const withPhotos = await overlayOfficialAvatars(
    (usersRows ?? []).map((u) => ({ id: u.id, avatarUrl: u.avatar_url })),
  );
  const avatarById = new Map(withPhotos.map((u) => [u.id, u.avatarUrl]));

  return (usersRows ?? []).map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: authEmailById.get(u.auth_user_id) ?? null,
    avatarUrl: avatarById.get(u.id) ?? u.avatar_url,
  }));
}

export const getCrmUserDirectory = unstable_cache(loadCrmUserDirectory, ["crm-user-directory-v1"], {
  revalidate: 120,
  tags: [CRM_USER_DIRECTORY_CACHE_TAG],
});

/** Expira na hora (não stale-while-revalidate): a próxima abertura do kanban já vê o dado novo. */
function expireTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (error) {
    // Fora de um Route Handler (script, teste) não há cache do Next para invalidar.
    console.warn(`[kanban-data-cache] revalidateTag(${tag}) ignorado:`, error instanceof Error ? error.message : error);
  }
}

export function invalidateRdReconciliationCache(): void {
  expireTag(RD_RECONCILIATION_CACHE_TAG);
}

export function invalidateCrmUserDirectory(): void {
  expireTag(CRM_USER_DIRECTORY_CACHE_TAG);
}
