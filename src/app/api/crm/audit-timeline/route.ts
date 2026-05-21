import { NextResponse } from "next/server";

/** @deprecated Timeline global substituída por Histórico por lead (`lead_activity_events` + aba na ficha). */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint descontinuado. Use a aba Histórico em /crm/leads/[id].",
    },
    { status: 410 },
  );
}
