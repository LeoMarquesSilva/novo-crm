import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionOpportunity } from "@/modules/crm/application/services/transition-opportunity";

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
  opportunityId: z.string().min(1),
  currentStage: stageSchema,
  nextStage: stageSchema,
  hasDueDiligence: z.boolean(),
  changedBy: z.string().min(1),
  payload: z
    .object({
      linkProposta: z.string().optional(),
      linkContrato: z.string().optional(),
      cadastroConcluido: z.boolean().optional(),
      financeiroConcluido: z.boolean().optional(),
    })
    .default({}),
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

  const result = transitionOpportunity(payload.data);
  const status = result.ok ? 200 : 422;

  return NextResponse.json(result, { status });
}
