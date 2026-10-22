/**
 * GET /api/crm/rd-migration/d4sign-documents?q= — documentos do cofre da D4Sign pelo nome, para
 *     a migração ligar o contrato enviado/assinado no processo do RD ao lead.
 */
import { NextResponse } from "next/server";

import { internalErrorResponse } from "@/lib/http/api-errors";
import { requireRdMigrationActor } from "@/lib/crm/rd-migration/route-helpers";
import { searchD4SignDocumentsForMigration } from "@/lib/crm/rd-migration/service";

export async function GET(request: Request) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const q = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
    const documents = await searchD4SignDocumentsForMigration(auth.supabase, q);
    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    return internalErrorResponse("rd-migration/d4sign", error, "Não foi possível buscar na D4Sign.");
  }
}
