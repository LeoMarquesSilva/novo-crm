/**
 * POST /api/crm/rd-migration/[id]/convert — admin converte um negócio do RD em lead do CRM
 *      (piloto antes da virada ou correção depois dela). Mesmo caminho da conversão em lote.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { internalErrorResponse } from "@/lib/http/api-errors";
import { requireRdMigrationActor } from "@/lib/crm/rd-migration/route-helpers";
import { convertRdMigration } from "@/lib/crm/rd-migration/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const parsed = z.string().uuid().safeParse(decodeURIComponent(id));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Lead inválido." }, { status: 400 });
    const result = await convertRdMigration(auth.supabase, { opportunityId: parsed.data, actor: auth.migrationActor });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return internalErrorResponse("rd-migration/convert", error, "Não foi possível converter o negócio.");
  }
}
