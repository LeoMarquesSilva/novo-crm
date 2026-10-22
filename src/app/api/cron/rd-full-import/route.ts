import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";
import { runRdFullImport } from "@/lib/crm/rd-import-run";

/**
 * Sincronização agendada (ex.: Vercel Cron 2x/dia).
 * Proteção: `Authorization: Bearer <CRON_SECRET>` (padrão Vercel) ou header `x-cron-secret`.
 */
export const maxDuration = 300;

async function run(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const year = yearParam
    ? Number.parseInt(yearParam, 10)
    : new Date().getFullYear();

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ ok: false, error: "year inválido." }, { status: 400 });
  }

  const result = await runRdFullImport(year);

  return NextResponse.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    summary: {
      imported: result.imported,
      importedDeals: result.importedDeals,
      importedLeads: result.importedLeads,
      skipped: result.skipped,
      frozen: result.frozen ?? false,
      failed: result.failed,
      year,
    },
  });
}

export async function GET(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada no import RD (cron).";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada no import RD (cron).";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
