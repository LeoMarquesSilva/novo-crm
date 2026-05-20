import { NextResponse } from "next/server";
import { z } from "zod";
import { canMoveToStage } from "@/modules/crm/domain/workflow";

const stageSchema = z.enum([
  "cadastro_lead",
  "levantamento_dados",
  "compilacao",
  "revisao",
  "due_diligence_finalizada",
  "reuniao",
  "confeccao_proposta",
  "proposta_enviada",
  "confeccao_contrato",
  "contrato_elaborado",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
]);

const bodySchema = z.object({
  currentStage: stageSchema,
  nextStage: stageSchema,
  hasDueDiligence: z.boolean(),
});

export async function POST(request: Request) {
  const json = await request.json();
  const payload = bodySchema.safeParse(json);

  if (!payload.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: payload.error.flatten() },
      { status: 400 },
    );
  }

  const canMove = canMoveToStage({
    currentStage: payload.data.currentStage,
    nextStage: payload.data.nextStage,
    hasDueDiligence: payload.data.hasDueDiligence,
  });

  return NextResponse.json({ ok: true, canMove });
}
