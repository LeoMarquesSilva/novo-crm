import { NextResponse } from "next/server";

/**
 * Legado: o envio real usa multipart em `POST /api/integrations/d4sign/send`.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Este endpoint foi substituído. Use POST /api/integrations/d4sign/send com multipart/form-data (opportunityId, signerEmail, file, …).",
    },
    { status: 410 },
  );
}
