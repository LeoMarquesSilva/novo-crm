import { NextResponse } from "next/server";
import { runRdFullImport } from "@/lib/crm/rd-import-run";

/**
 * Sincronização agendada (ex.: Vercel Cron 2x/dia).
 * Proteção: `Authorization: Bearer <CRON_SECRET>` (padrão Vercel) ou header `x-cron-secret`.
 */
export const maxDuration = 300;

function isAuthorized(request: Request, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) {
    return true;
  }
  return request.headers.get("x-cron-secret") === secret;
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET ausente ou fraco — defina um segredo seguro no ambiente (ex.: 32 caracteres).",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

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
