/**
 * GET /api/crm/d4sign/firm-signers
 * Retorna a lista canônica de signatários da CONTRATADA (sócios da firma).
 * Aceita override via env `D4SIGN_FIRM_SIGNERS`.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";

export async function GET() {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, data: getFirmSigners() });
}
