/**
 * POST /api/crm/rd-migration/cutover — dia da virada (só admin, `docs/cutover-runbook.md`).
 * Body `{ action }`:
 * - `final_import`: importa o RD pela última vez (antes de congelar);
 * - `freeze` / `unfreeze`: congela ou reabre o sync do RD (webhook e cron ignoram tudo);
 * - `convert_all`: converte os negócios em escopo (pode repetir até `remaining` = 0);
 * - `rollback`: desfaz a conversão (leads voltam a ser do RD) e reabre o sync.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { internalErrorResponse, PublicError } from "@/lib/http/api-errors";
import { runRdFullImport } from "@/lib/crm/rd-import-run";
import { requireRdMigrationActor } from "@/lib/crm/rd-migration/route-helpers";
import {
  convertAllRdMigrations,
  rollbackRdMigrations,
  setRdSyncFrozen,
} from "@/lib/crm/rd-migration/service";
import { isRdSyncFrozen } from "@/lib/crm/rd-migration/state";

export const maxDuration = 300;

/** Margem para responder antes do `maxDuration`: a conversão para e diz quantos faltam. */
const CONVERT_DEADLINE_MS = 240_000;

const bodySchema = z.object({
  action: z.enum(["final_import", "freeze", "unfreeze", "convert_all", "rollback"]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    if (!auth.migrationActor.isAdmin) {
      return NextResponse.json({ ok: false, error: "Só o admin conduz a virada." }, { status: 403 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    const { supabase, migrationActor: actor } = auth;

    switch (parsed.data.action) {
      case "final_import": {
        if (await isRdSyncFrozen(supabase)) {
          throw new PublicError("O RD já está congelado; reabra o sync para importar de novo.", 409, "FROZEN");
        }
        const result = await runRdFullImport(new Date().getFullYear());
        return NextResponse.json({
          ok: true,
          import: {
            importedDeals: result.importedDeals,
            importedLeads: result.importedLeads,
            skipped: result.skipped,
            failed: result.failed,
          },
        });
      }
      case "freeze":
      case "unfreeze": {
        const virada = await setRdSyncFrozen(supabase, { actor, frozen: parsed.data.action === "freeze" });
        return NextResponse.json({ ok: true, virada });
      }
      case "convert_all": {
        if (!(await isRdSyncFrozen(supabase))) {
          throw new PublicError("Congele o RD antes de converter os negócios.", 409, "NOT_FROZEN");
        }
        const summary = await convertAllRdMigrations(supabase, { actor, deadlineMs: CONVERT_DEADLINE_MS });
        return NextResponse.json({ ok: true, summary });
      }
      case "rollback": {
        const result = await rollbackRdMigrations(supabase, { actor });
        return NextResponse.json({ ok: true, rollback: result });
      }
    }
  } catch (error) {
    return internalErrorResponse("rd-migration/cutover", error, "Não foi possível concluir a ação da virada.");
  }
}
