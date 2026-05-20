import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { loadProposalCatalog } from "@/lib/crm/proposal-catalog-db";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const data = await loadProposalCatalog();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar catálogo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
