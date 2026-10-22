import { NextResponse } from "next/server";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Renovações da carteira numa consulta só (aba Renovações de `/crm/contratos`).
 * O cron só gera `contrato_renovacao_pendente` para contrato ativo, e um contrato ativo
 * só sai para suspenso ou encerrado; por isso basta filtrar `contratos.status = ativo`.
 */
export async function GET() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "view" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  }
  const supabase = createSupabaseAdminClient();
  const [alertsResult, usersResult] = await Promise.all([
    supabase.from("contrato_alertas")
      .select("id, contrato_id, data_base, data_vencimento, status, responsavel_app_user_id, cliente_notificado_em, cliente_notificado_por, decisao, resolucao, updated_at, contratos!inner(status)")
      .eq("tipo", "contrato_renovacao_pendente")
      .eq("contratos.status", "ativo")
      .order("data_base", { ascending: true, nullsFirst: false }),
    supabase.from("app_users").select("id, full_name").in("role", ["controladoria", "admin"]).order("full_name"),
  ]);
  const error = alertsResult.error ?? usersResult.error;
  if (error) return json({ ok: false, error: error.message }, 500);
  // `contratos` só serve ao filtro de status; a tela recebe o alerta como antes.
  const alerts = (alertsResult.data ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "contratos")));
  return json({ ok: true, alerts, users: usersResult.data ?? [] });
}
