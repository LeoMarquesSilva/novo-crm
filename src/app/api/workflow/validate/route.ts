import { NextResponse } from "next/server";

/** @deprecated Validação de etapa ocorre em POST /api/crm/leads/transition (autenticado). */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint descontinuado. Use POST /api/crm/leads/transition.",
      replacement: "/api/crm/leads/transition",
    },
    { status: 410 },
  );
}
