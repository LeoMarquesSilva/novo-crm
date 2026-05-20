import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { runRdFullImport } from "@/lib/crm/rd-import-run";

const bodySchema = z
  .object({
    year: z.number().int().min(2000).max(2100).default(2026),
  })
  .partial();

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const rawBody = await request
      .json()
      .catch(() => ({})) as unknown;
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: "Payload inválido.", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const year = parsedBody.data.year ?? 2026;
    const result = await runRdFullImport(year);

    return NextResponse.json({
      ok: true,
      summary: {
        imported: result.imported,
        importedDeals: result.importedDeals,
        importedLeads: result.importedLeads,
        skipped: result.skipped,
        failed: result.failed,
        year,
      },
      records: result.records,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada no import RD.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
