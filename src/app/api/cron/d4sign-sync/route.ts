/**
 * Cron agendado (Vercel) — sincroniza cofre D4Sign + enrich + pré-cache PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import { precacheD4SignPdfs } from "@/lib/d4sign/pdf-precache";
import { cronEnrichBudget } from "@/lib/d4sign/enrich-documents";
import { runVaultSync } from "@/lib/d4sign/vault-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

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

  const enrichBudget = await cronEnrichBudget(2);
  const syncResult = await runVaultSync({
    apiSource: "cron",
    maxFolderWalk: 3,
    enrichAfter: enrichBudget,
  });

  // Pré-cache PDF: até 1 doc pendente finalizado sem cache (se sobrar quota)
  let precache = { cached: 0, skipped: 0 };
  if (syncResult.ok) {
    const supabase = createSupabaseAdminClient();
    const { data: candidates } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc")
      .in("d4sign_status", ["1", "3", "sent", "2"])
      .order("updated_at", { ascending: false })
      .limit(1);
    const uuids = (candidates ?? []).map((r) => r.uuid_doc);
    if (uuids.length > 0) {
      precache = await precacheD4SignPdfs(uuids);
    }
  }

  return NextResponse.json({
    ok: syncResult.ok,
    triggeredAt: new Date().toISOString(),
    sync: syncResult,
    precache,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
