import { NextResponse } from "next/server";

/** @deprecated Use POST /api/crm/leads/transition (autenticado, Supabase). */
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
