/**
 * Cron agendado (Vercel) — sincroniza `orqestrai_colaboradores` a partir de
 * `hr_employees` no ORQESTRAI, todo dia de manhã.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncOrqestraiCollaborators } from "@/lib/orqestrai/sync-collaborators";

export const maxDuration = 60;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET ausente ou fraco." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

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
