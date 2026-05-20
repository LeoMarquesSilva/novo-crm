import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import {
  buildReconciliationSummary,
  type ReconciliationRecord,
} from "@/modules/crm/application/services/reconciliation-report";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_STATUS = new Set<ReconciliationRecord["status"]>([
  "importado",
  "conflito",
  "erro",
]);

function normalizeStatus(raw: string): ReconciliationRecord["status"] {
  if (ALLOWED_STATUS.has(raw as ReconciliationRecord["status"])) {
    return raw as ReconciliationRecord["status"];
  }
  return "importado";
}

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("rd_deal_reconciliacao")
      .select("rd_deal_id, oportunidade_id, status")
      .order("reconciled_at", { ascending: false })
      .limit(5000);

    if (error) {
      throw error;
    }

    const records: ReconciliationRecord[] = (data ?? []).map((row) => ({
      rdDealId: row.rd_deal_id,
      opportunityId: row.oportunidade_id,
      status: normalizeStatus(row.status),
    }));

    const summary = buildReconciliationSummary(records);

    return NextResponse.json({ ok: true, summary, records });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao carregar reconciliação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
