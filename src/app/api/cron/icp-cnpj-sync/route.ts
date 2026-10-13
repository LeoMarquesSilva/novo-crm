/**
 * Cron — consulta na Receita (OpenCNPJ/BrasilAPI) os CNPJs dos grupos de clientes
 * que faltam no icp_cnpj_cadastro e renova os vencidos. `?limit=N` (padrão 250).
 */
import { NextRequest, NextResponse } from "next/server";

import { syncIcpCnpjs } from "@/modules/icp/infrastructure/cnpj-sync";

export const maxDuration = 300;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET ausente ou fraco." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : undefined;
  const result = await syncIcpCnpjs({ limit });
  // `result.ok` é a contagem de CNPJs encontrados; por isso vai aninhado.
  return NextResponse.json({ ok: true, result, triggeredAt: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de CNPJ do ICP.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await run(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cron de CNPJ do ICP.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
