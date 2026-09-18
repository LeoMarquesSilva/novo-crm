import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import {
  loadGrupoCarteiraEdit,
  saveGrupoCarteira,
  saveGrupoCarteiraSchema,
} from "@/lib/crm/save-grupo-carteira";

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return jsonError("Grupo inválido.", 400);
    }
    const result = await loadGrupoCarteiraEdit(id);
    if (!result.ok) return jsonError(result.error, result.status);
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar o grupo.";
    return jsonError(message, 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
      return jsonError("Sem permissão para editar o grupo.", 403);
    }
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return jsonError("Grupo inválido.", 400);
    }
    const parsed = saveGrupoCarteiraSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError("Dados inválidos para gravar o grupo.", 400);
    }
    const result = await saveGrupoCarteira(id, parsed.data);
    if (!result.ok) return jsonError(result.error, result.status);
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gravar o grupo.";
    return jsonError(message, 500);
  }
}
