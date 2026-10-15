import { NextResponse } from "next/server";

/**
 * @deprecated Substituída pela rodada `/api/cron/d4sign-sync` (GitHub Actions) e por
 * "Atualizar cofre" (`POST /api/crm/d4sign/vault-sync`).
 */
function gone() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint descontinuado. Use POST /api/crm/d4sign/vault-sync.",
      replacement: "/api/crm/d4sign/vault-sync",
    },
    { status: 410 },
  );
}

export async function POST() {
  return gone();
}

export async function GET() {
  return gone();
}
