/**
 * GET /api/crm/leads/[id]/onboarding/vios?q=… — grupos do VIOS (SIOE `pessoas`) pelo nome.
 * GET /api/crm/leads/[id]/onboarding/vios?grupo=… — pessoas do grupo e a conferência do cadastro
 *     do cliente com a pessoa de mesmo CPF/CNPJ (inclui o código `ci` do VIOS).
 * Só quem confere o cadastro (Operações Legais e admin).
 */
import { NextResponse } from "next/server";

import { requireOnboardingContext } from "@/lib/crm/client-onboarding/route-helpers";
import {
  compareCadastroWithVios,
  loadViosGroupPeople,
  searchViosGroups,
} from "@/lib/crm/client-onboarding/vios-pessoas";
import { internalErrorResponse } from "@/lib/http/api-errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireOnboardingContext(params, "review");
    if (!result.ok) return result.response;
    const url = new URL(request.url);
    const grupo = url.searchParams.get("grupo")?.trim() ?? "";
    if (grupo) {
      const pessoas = await loadViosGroupPeople(grupo);
      return NextResponse.json({
        ok: true,
        grupo,
        pessoas,
        conferencia: compareCadastroWithVios(result.ctx.payload.cadastro, pessoas),
      });
    }
    const grupos = await searchViosGroups(url.searchParams.get("q") ?? "");
    return NextResponse.json({ ok: true, grupos });
  } catch (error) {
    return internalErrorResponse("onboarding/vios", error, "Não foi possível ler o VIOS.");
  }
}
