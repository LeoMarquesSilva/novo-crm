import { NextResponse } from "next/server";

/**
 * @deprecated O VIOS não tem integração por API: o cadastro do cliente no VIOS é feito
 * manualmente por Operações Legais (etapa Cadastro de Novo Cliente) e o CRM guarda só a
 * referência. Esta rota devolvia um cliente fictício e foi desligada.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Cadastro no VIOS é manual (Operações Legais). Integração por API não disponível.",
    },
    { status: 410 },
  );
}
