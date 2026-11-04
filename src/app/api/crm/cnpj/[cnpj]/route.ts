import { NextResponse } from "next/server";

import { requireAuthApi } from "@/lib/auth/server";
import { lookupCnpj } from "@/lib/crm/cnpj-lookup";
import { isValidCnpj } from "@/lib/crm/rd-migration/documents";
import { internalErrorResponse } from "@/lib/http/api-errors";

/**
 * Razão social e situação de um CNPJ na Receita (Fichário, com BrasilAPI de reserva), para o
 * Novo Lead preencher a empresa ao digitar o CNPJ (04/11/2026). Só usuário logado.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    const digits = (await params).cnpj.replace(/\D/g, "");
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      return NextResponse.json({ ok: false, error: "CNPJ inválido." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, data: await lookupCnpj(digits) });
  } catch (error) {
    return internalErrorResponse("cnpj/lookup", error, "Não foi possível consultar o CNPJ.");
  }
}
