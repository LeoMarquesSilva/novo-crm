/**
 * Cron — consulta na Receita (OpenCNPJ/BrasilAPI) os CNPJs dos grupos de clientes
 * que faltam no icp_cnpj_cadastro e renova os vencidos. `?limit=N` (padrão 250).
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/http/cron-auth";

import { syncIcpCnpjs } from "@/modules/icp/infrastructure/cnpj-sync";

export const maxDuration = 300;

async function run(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

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
