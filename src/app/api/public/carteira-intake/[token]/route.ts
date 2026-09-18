import { NextResponse } from "next/server";
import { z } from "zod";
import {
  grupoIntakeRowSubmitSchema,
  loadGrupoIntakeGrid,
  submitGrupoIntakeRow,
} from "@/lib/crm/grupo-intake-service";

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
    const message = error instanceof Error ? error.message : "Erro ao carregar a grade.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = grupoIntakeRowSubmitSchema.parse(await request.json());
    const result = await submitGrupoIntakeRow(token, body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Erro ao gravar o preenchimento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
