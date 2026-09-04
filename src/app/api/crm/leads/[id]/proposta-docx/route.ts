import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";

/** Retired: every export uses the canonical, versioned endpoint. */
export async function POST() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: false, error: "Rota descontinuada. Use /document/generate-docx." }, { status: 410 });
}
