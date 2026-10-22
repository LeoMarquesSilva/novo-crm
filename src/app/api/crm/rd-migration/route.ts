/**
 * GET /api/crm/rd-migration — fila "Migrar do RD": negócios em andamento do RD com a etapa onde
 *     caem no CRM, responsável, pendências e o estado da virada. Admin vê todos; os demais, os seus.
 */
import { NextResponse } from "next/server";

import { internalErrorResponse } from "@/lib/http/api-errors";
import { requireRdMigrationActor } from "@/lib/crm/rd-migration/route-helpers";
import { loadRdMigrationQueue } from "@/lib/crm/rd-migration/service";

export const maxDuration = 60;

export async function GET() {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const queue = await loadRdMigrationQueue(auth.supabase, auth.migrationActor);
    return NextResponse.json({ ok: true, isAdmin: auth.migrationActor.isAdmin, ...queue });
  } catch (error) {
    return internalErrorResponse("rd-migration/queue", error, "Não foi possível carregar a fila da migração.");
  }
}
