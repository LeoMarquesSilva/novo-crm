/**
 * GET   /api/crm/rd-migration/[id] — formulário da migração de um negócio do RD (valores
 *       pré-preenchidos com o RD + rascunho, pendências da etapa, campos do RD).
 * PUT   /api/crm/rd-migration/[id] — salva o formulário (responsável ou admin). Antes da virada é
 *       rascunho; num lead convertido grava no CRM e conclui a migração quando nada falta.
 * PATCH /api/crm/rd-migration/[id] — admin: responsável e "fora da migração".
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { internalErrorResponse } from "@/lib/http/api-errors";
import { requireRdMigrationActor } from "@/lib/crm/rd-migration/route-helpers";
import { loadRdMigrationDetail, saveRdMigration, updateRdMigrationAdmin } from "@/lib/crm/rd-migration/service";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

async function opportunityIdFrom(params: Params["params"]): Promise<string | null> {
  const { id } = await params;
  const parsed = idSchema.safeParse(decodeURIComponent(id));
  return parsed.success ? parsed.data : null;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const opportunityId = await opportunityIdFrom(params);
    if (!opportunityId) return NextResponse.json({ ok: false, error: "Lead inválido." }, { status: 400 });
    const detail = await loadRdMigrationDetail(auth.supabase, opportunityId, auth.migrationActor);
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return internalErrorResponse("rd-migration/get", error, "Não foi possível carregar a migração.");
  }
}

const putSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  expectedUpdatedAt: z.string().max(64).nullable().optional(),
});

export async function PUT(request: Request, { params }: Params) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const opportunityId = await opportunityIdFrom(params);
    if (!opportunityId) return NextResponse.json({ ok: false, error: "Lead inválido." }, { status: 400 });
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    const result = await saveRdMigration(auth.supabase, {
      opportunityId,
      actor: auth.migrationActor,
      values: parsed.data.values,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return internalErrorResponse("rd-migration/put", error, "Não foi possível salvar a migração.");
  }
}

const patchSchema = z
  .object({
    responsavelAppUserId: z.string().uuid().nullable().optional(),
    fora: z.union([z.object({ motivo: z.string().trim().min(3).max(500) }), z.literal(false)]).optional(),
  })
  .refine((v) => v.responsavelAppUserId !== undefined || v.fora !== undefined, "Nada a alterar.");

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireRdMigrationActor();
    if (!auth.ok) return auth.response;
    const opportunityId = await opportunityIdFrom(params);
    if (!opportunityId) return NextResponse.json({ ok: false, error: "Lead inválido." }, { status: 400 });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    const detail = await updateRdMigrationAdmin(auth.supabase, {
      opportunityId,
      actor: auth.migrationActor,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return internalErrorResponse("rd-migration/patch", error, "Não foi possível alterar a migração.");
  }
}
