/**
 * POST /api/crm/icp/refresh — botão "Recalcular" do ICP: expira o cache do cálculo
 * (6h) para a próxima leitura buscar os dados de novo.
 */
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireAuthApi } from "@/lib/auth/server";
import { hasModuleAccess } from "@/lib/auth/module-access";
import { ICP_CACHE_TAG } from "@/modules/icp/infrastructure/icp-data-loader";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  if (!(await hasModuleAccess(auth.profile, "icp"))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para o ICP. Peça a liberação a um administrador." },
      { status: 403 },
    );
  }

  try {
    // Expira na hora (não stale-while-revalidate): quem clica espera ver o dado novo.
    revalidateTag(ICP_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao recalcular o ICP.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
