import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/auth/server";
import { runRdFullImport } from "@/lib/crm/rd-import-run";

const bodySchema = z
  .object({
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const year = parsed.data.year ?? 2026;
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
      error instanceof Error ? error.message : "Falha inesperada na sincronização RD.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
