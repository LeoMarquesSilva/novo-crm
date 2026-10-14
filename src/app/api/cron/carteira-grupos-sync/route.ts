/**
 * Cron — espelha grupos/pessoas do ORQESTRAI (email_*) e títulos SIOE.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncCarteiraGrupos } from "@/lib/sioe/sync-carteira";

export const maxDuration = 120;

async function run(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const supabase = createSupabaseAdminClient();
  const result = await syncCarteiraGrupos(supabase);
  return NextResponse.json({ ...result, triggeredAt: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de carteira.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de carteira.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
