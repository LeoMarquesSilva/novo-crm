import { NextResponse } from "next/server";
import { z } from "zod";
import {
  grupoIntakeRowSubmitSchema,
  loadGrupoIntakeGrid,
  submitGrupoIntakeRow,
} from "@/lib/crm/grupo-intake-service";
import { internalErrorResponse } from "@/lib/http/api-errors";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const result = await loadGrupoIntakeGrid(token);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    return internalErrorResponse(
      "public/carteira-intake/get",
      error,
      "Não foi possível carregar a grade. Tente novamente.",
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = grupoIntakeRowSubmitSchema.parse(await request.json().catch(() => null));
    const result = await submitGrupoIntakeRow(token, body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
    }
    return internalErrorResponse(
      "public/carteira-intake/post",
      error,
      "Não foi possível gravar o preenchimento. Tente novamente.",
    );
  }
}
