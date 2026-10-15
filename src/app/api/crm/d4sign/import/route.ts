import { NextResponse } from "next/server";

/** @deprecated Use POST /api/crm/d4sign/vault-sync ("Atualizar cofre"). */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint descontinuado. Use POST /api/crm/d4sign/vault-sync.",
      replacement: "/api/crm/d4sign/vault-sync",
    },
    { status: 410 },
  );
}
