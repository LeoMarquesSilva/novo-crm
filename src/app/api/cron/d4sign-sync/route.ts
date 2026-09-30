/**
 * Sync horário do cofre, disparado pelo GitHub Actions (não pela Vercel).
 * Cota global: 10 req/h. A primeira vaga é sempre a página da raiz.
 * Enquanto houver pasta de cliente ainda não varrida, o resto da hora
 * importa contratos dessas pastas. Depois, 1 pasta por hora e o resto
 * em signatários (pendentes primeiro). PDF só se ainda sobrar chamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { precacheD4SignPdfs } from "@/lib/d4sign/pdf-precache";
import { runVaultFolderWalk } from "@/lib/d4sign/vault-folder-walk";
import { runVaultSafeListing } from "@/lib/d4sign/vault-listing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

/** O log da chamada é assíncrono; usa o menor entre o banco e a conta local. */
function callsLeft(reported: number, accounted: number): number {
  return Math.min(reported, Math.max(0, accounted));
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

  const before = await getD4SignQuotaStatus();
  if (before.remaining < 1) {
    return NextResponse.json(
      {
        ok: false,
        triggeredAt: new Date().toISOString(),
        error: "Quota D4Sign esgotada. A vaga reservada é a listagem do cofre.",
        rateLimited: true,
        quota: before,
        listing: null,
        folders: null,
        enrich: null,
        precache: { cached: 0, skipped: 0 },
      },
      { status: 429 },
    );
  }

  const listing = await runVaultSafeListing({ maxRequests: 1, apiSource: "cron" });
  const afterListing = await getD4SignQuotaStatus();
  const leftAfterListing = callsLeft(afterListing.remaining, before.remaining - listing.requests);

  const folders =
    listing.ok && leftAfterListing >= 1
      ? await runVaultFolderWalk({ maxRequests: leftAfterListing, apiSource: "cron" })
      : null;

  const afterFolders = await getD4SignQuotaStatus();
  const leftAfterFolders = callsLeft(
    afterFolders.remaining,
    leftAfterListing - (folders?.requests ?? 0),
  );
  const folderBacklog = Boolean(folders && folders.mode === "walk" && folders.foldersLeft > 0);
  const enrichBudget =
    listing.ok && folders?.ok !== false && !folderBacklog ? leftAfterFolders : 0;

  let enrich: Awaited<ReturnType<typeof enrichDocuments>> | null = null;
  let picked = 0;
  if (enrichBudget > 0) {
    const env = getD4SignEnv();
    const rows = await pickDocumentsToEnrich({ limit: enrichBudget });
    picked = rows.length;
    if (rows.length > 0 && env.tokenApi) {
      enrich = await enrichDocuments(env, rows, { apiSource: "cron" });
    }
  }

  const usedByEnrich = enrich?.enriched ?? 0;
  const afterEnrich = await getD4SignQuotaStatus();
  const leftForPrecache = callsLeft(afterEnrich.remaining, enrichBudget - usedByEnrich);

  let precache = { cached: 0, skipped: 0 };
  if (listing.ok && !folderBacklog && leftForPrecache >= 1 && picked < enrichBudget) {
    const supabase = createSupabaseAdminClient();
    const { data: candidates } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc")
      .in("d4sign_status", ["1", "3", "sent", "2"])
      .order("updated_at", { ascending: false })
      .limit(1);
    const uuids = (candidates ?? []).map((row) => row.uuid_doc);
    if (uuids.length > 0) {
      precache = await precacheD4SignPdfs(uuids);
    }
  }

  const ok = listing.ok && folders?.ok !== false;
  return NextResponse.json({
    ok,
    triggeredAt: new Date().toISOString(),
    listing,
    folders,
    enrich,
    precache,
    quota: await getD4SignQuotaStatus(),
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
