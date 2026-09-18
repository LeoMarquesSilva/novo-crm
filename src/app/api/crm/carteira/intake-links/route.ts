import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { ensureCarteiraIntakeLink } from "@/lib/crm/grupo-intake-service";
import { GRUPO_INTAKE_MAX_TTL_DAYS } from "@/lib/crm/grupo-intake-token";

const bodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(GRUPO_INTAKE_MAX_TTL_DAYS).optional(),
  rotate: z.boolean().optional(),
});

function canIssueIntakeLinks(role: "admin" | "comercial" | "controladoria" | "financeiro") {
  return (
    canAccessContractCapability({ role, capability: "configure" }) ||
    role === "comercial"
  );
}

async function parseBody(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canIssueIntakeLinks(auth.profile.role)) {
      return NextResponse.json({ ok: false, error: "Sem permissão para copiar o link público." }, { status: 403 });
    }

    const body = bodySchema.parse(await parseBody(request));
    const link = await ensureCarteiraIntakeLink({
      request,
      createdBy: auth.profile.id,
      expiresInDays: body.expiresInDays,
      rotate: body.rotate,
    });

    return NextResponse.json({
      ok: true,
      data: {
        url: link.url,
        expiresAt: link.expiresAt,
        reused: link.reused,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Erro ao obter o link de preenchimento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
