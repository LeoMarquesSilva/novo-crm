import {
  D4SIGN_HOURLY_LIMIT,
  getD4SignQuotaStatus,
  type D4SignQuotaStatus,
} from "@/lib/d4sign/api-usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type QuotaReservation = {
  ok: true;
  quota: D4SignQuotaStatus;
  reserved: number;
};

export type QuotaDenied = {
  ok: false;
  quota: D4SignQuotaStatus;
  needed: number;
  message: string;
};

export function isRateLimitError(message: string): boolean {
  return /401|429|tempo limite|rate.?limit|limite para este método/i.test(message);
}

/** Verifica se há quota suficiente antes de uma operação multi-req. */
export async function assertD4SignQuota(
  needed: number,
  operationLabel: string,
): Promise<QuotaReservation | QuotaDenied> {
  const quota = await getD4SignQuotaStatus();
  if (quota.remaining < needed) {
    const resetHint = quota.resetAt
      ? ` Libera ${new Date(quota.resetAt).toLocaleTimeString("pt-BR")}.`
      : "";
    return {
      ok: false,
      quota,
      needed,
      message:
        `Quota D4Sign insuficiente para ${operationLabel} (precisa ${needed}, restam ${quota.remaining}/${quota.limit}).${resetHint}`,
    };
  }
  return { ok: true, quota, reserved: needed };
}

/** Notifica admin/comercial quando quota esgota (máx. 1× por hora). */
export async function notifyQuotaExhausted(context: {
  operation: string;
  pendingSigners?: number;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await admin
      .from("crm_in_app_notifications")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "d4sign_quota_exhausted")
      .gte("created_at", since);

    if ((count ?? 0) > 0) return;

    const { data: users } = await admin
      .from("app_users")
      .select("auth_user_id")
      .in("role", ["admin", "comercial"])
      .not("auth_user_id", "is", null);

    if (!users?.length) return;

    const preview =
      context.pendingSigners && context.pendingSigners > 0
        ? `${context.pendingSigners} contrato(s) ainda sem signatários. Aguarde ~1h ou contate comercial@d4sign.com.br para aumentar a quota.`
        : "Limite de 10 req/h atingido. Tente novamente em ~1 hora.";

    await admin.from("crm_in_app_notifications").insert(
      users.map((u) => ({
        user_id: u.auth_user_id as string,
        tipo: "d4sign_quota_exhausted",
        payload: {
          operation: context.operation,
          title: "D4Sign — quota API esgotada",
          preview,
          path: "/crm/contratos",
        } as never,
      })),
    );
  } catch {
    // best-effort
  }
}

export function formatQuotaSummary(quota: D4SignQuotaStatus): string {
  return `${quota.used}/${quota.limit ?? D4SIGN_HOURLY_LIMIT} req/h`;
}
