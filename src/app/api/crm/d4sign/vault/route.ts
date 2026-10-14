import { NextResponse } from "next/server";

/**
 * @deprecated Listagem direta do cofre pela API da D4Sign (gastava cota a cada abertura).
 * O catálogo `d4sign_documents` é mantido pela rodada de sync (`/api/cron/d4sign-sync`) e
 * por "Atualizar cofre" (`POST /api/crm/d4sign/vault-sync`).
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint descontinuado. Use o catálogo D4Sign do CRM (aba Assinaturas D4Sign).",
      replacement: "/api/crm/d4sign/vault-sync",
    },
    { status: 410 },
  );
}
