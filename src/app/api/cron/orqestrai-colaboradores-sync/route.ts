/**
 * Cron agendado (Vercel) — sincroniza `orqestrai_colaboradores` a partir de
 * `hr_employees` no ORQESTRAI, todo dia de manhã.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncOrqestraiCollaborators } from "@/lib/orqestrai/sync-collaborators";

export const maxDuration = 60;

async function run(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const supabase = createSupabaseAdminClient();
  const result = await syncOrqestraiCollaborators(supabase);

  return NextResponse.json({ ...result, triggeredAt: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de colaboradores.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de colaboradores.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
