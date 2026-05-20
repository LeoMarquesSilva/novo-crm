import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { tryAutoAdvanceLevantamentoToCompilacao } from "@/lib/crm/due-area-tasks";

const statusSchema = z.enum(["pendente", "em_andamento", "disponibilizado"]);

const bodySchema = z.object({
  taskId: z.string().uuid(),
  status: statusSchema,
  pastaDueConfirmada: z.boolean().optional(),
  semProcessosAtivos: z.boolean().optional(),
  observacaoSemProcessos: z.string().max(8000).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const { id: opportunityId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: task, error: taskError } = await supabase
    .from("due_area_tasks")
    .select(
      "id, oportunidade_id, responsavel_app_user_id, status, iniciado_em, pasta_due_confirmada",
    )
    .eq("id", parsed.data.taskId)
    .eq("oportunidade_id", opportunityId)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json({ ok: false, error: taskError.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ ok: false, error: "Tarefa DUE não encontrada" }, { status: 404 });
  }

  const canUpdate =
    auth.profile?.role === "admin" ||
    auth.profile?.role === "comercial" ||
    auth.profile?.id === task.responsavel_app_user_id;

  if (!canUpdate) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para atualizar esta tarefa DUE." },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const nextStatus = parsed.data.status;
  const semFlag = parsed.data.semProcessosAtivos === true;

  if (nextStatus === "disponibilizado") {
    if (semFlag) {
      // entrega válida sem pasta
    } else {
      const pastaOk =
        parsed.data.pastaDueConfirmada === true ||
        Boolean(task.pasta_due_confirmada);
      if (!pastaOk) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Para confirmar a entrega com pasta Due Diligence, marque a confirmação da pasta ou utilize a opção \"sem processos ativos\".",
          },
          { status: 422 },
        );
      }
    }
  }

  let iniciadoEm = task.iniciado_em as string | null;
  if (nextStatus === "em_andamento" && !iniciadoEm) {
    iniciadoEm = now;
  }

  const pastaDueConfirmada = nextStatus === "disponibilizado" && !semFlag;

  const semProcessosAtivos = nextStatus === "disponibilizado" && semFlag;

  const observacaoSemProcessos =
    nextStatus === "disponibilizado" && semFlag
      ? (parsed.data.observacaoSemProcessos?.trim() || null)
      : null;

  const { error: updateError } = await supabase
    .from("due_area_tasks")
    .update({
      status: nextStatus,
      pasta_due_confirmada: pastaDueConfirmada,
      sem_processos_ativos: semProcessosAtivos,
      observacao_sem_processos: observacaoSemProcessos,
      iniciado_em: iniciadoEm,
      dados_disponibilizados_em: nextStatus === "disponibilizado" ? now : null,
      updated_at: now,
    })
    .eq("id", task.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const advanced = await tryAutoAdvanceLevantamentoToCompilacao(
    supabase,
    opportunityId,
    auth.profile?.id ?? null,
  );

  return NextResponse.json({ ok: true, autoAdvancedToCompilacao: advanced });
}
