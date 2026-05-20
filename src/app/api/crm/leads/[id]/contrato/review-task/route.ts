/**
 * POST /api/crm/leads/[id]/contrato/review-task
 *
 * Cria ou atualiza a tarefa de revisão de contrato para um lead.
 * Quando um prazo for informado, dispara notificações in-app para todos os
 * usuários com `area = 'Societário e Contratos'`.
 *
 * PATCH /api/crm/leads/[id]/contrato/review-task
 * Atualiza status (em_revisao | concluido) + observação.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const upsertSchema = z.object({
  prazoRevisao: z.string().min(1).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
});

const patchSchema = z.object({
  status: z.enum(["pendente", "em_revisao", "concluido"]).optional(),
  observacao: z.string().max(2000).optional().nullable(),
});

// ─── POST: criar ou upsert review task + notificar ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode definir prazo de revisão." },
        { status: 403 },
      );
    }

    const parsed = upsertSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    // Verificar oportunidade
    const { data: op } = await supabase
      .from("oportunidades")
      .select("id, solicitante_nome")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const prazoIso = parsed.data.prazoRevisao
      ? new Date(
          parsed.data.prazoRevisao.includes("/")
            ? parsed.data.prazoRevisao.split("/").reverse().join("-")
            : parsed.data.prazoRevisao,
        ).toISOString()
      : null;

    // Upsert review task
    const { data: task, error: taskErr } = await supabase
      .from("contract_review_tasks")
      .upsert(
        {
          oportunidade_id: oportunidadeId,
          prazo_revisao: prazoIso,
          status: "pendente",
          created_by: auth.profile.id,
          observacao: parsed.data.observacao ?? null,
        },
        { onConflict: "oportunidade_id", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (taskErr) throw taskErr;

    // Notificar usuários da área "Societário e Contratos"
    const { data: recipients } = await supabase
      .from("app_users")
      .select("id, auth_user_id, full_name")
      .eq("area", "Societário e Contratos");

    const now = new Date().toISOString();
    if (recipients && recipients.length > 0 && prazoIso) {
      const prazoFormatado = new Date(prazoIso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const solicitanteNome = op.solicitante_nome ?? "";
      const requestedBy = auth.profile?.full_name ?? "Sistema";

      const notifications = recipients.map((u) => ({
        user_id: u.auth_user_id,
        tipo: "contract_review_requested",
        payload: {
          // Campos renderizados diretamente pelo sino de notificações
          title: "Revisão de contrato solicitada",
          preview: `${solicitanteNome} · Prazo: ${prazoFormatado} · Por: ${requestedBy}`,
          path: `/crm/leads/${encodeURIComponent(oportunidadeId)}`,
          // Metadados extras
          oportunidade_id: oportunidadeId,
          solicitante_nome: solicitanteNome,
          prazo_revisao: prazoIso,
          review_task_id: task.id,
          requested_by: requestedBy,
        },
      }));

      await supabase.from("crm_in_app_notifications").insert(notifications);

      // Marcar notificação enviada
      await supabase
        .from("contract_review_tasks")
        .update({ notificado_em: now })
        .eq("id", task.id);
    }

    return NextResponse.json({ ok: true, data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar tarefa de revisão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ─── PATCH: atualizar status / observação ────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const updateData: {
      status?: string;
      concluido_em?: string;
      observacao?: string | null;
    } = {};
    if (parsed.data.status) {
      updateData.status = parsed.data.status;
      if (parsed.data.status === "concluido") {
        updateData.concluido_em = new Date().toISOString();
      }
    }
    if (parsed.data.observacao !== undefined) {
      updateData.observacao = parsed.data.observacao;
    }

    const { data, error } = await supabase
      .from("contract_review_tasks")
      .update(updateData)
      .eq("oportunidade_id", oportunidadeId)
      .select("*")
      .single();
    if (error) throw error;

    // Ao concluir revisão → avança para Contrato Elaborado (pronto para envio D4Sign)
    if (parsed.data.status === "concluido") {
      const { data: op } = await supabase
        .from("oportunidades")
        .select("id, etapa")
        .eq("id", oportunidadeId)
        .maybeSingle();

      if (op?.etapa === "confeccao_contrato") {
        const nowIso = new Date().toISOString();
        await supabase
          .from("oportunidades")
          .update({ etapa: "contrato_elaborado", updated_at: nowIso })
          .eq("id", oportunidadeId);

        await supabase.from("transicoes_etapa").insert({
          oportunidade_id: oportunidadeId,
          etapa_origem: "confeccao_contrato",
          etapa_destino: "contrato_elaborado",
          alterado_por: auth.profile?.id ?? null,
          observacao:
            "Automático: revisão Societário e Contratos concluída — contrato liberado para envio.",
        });
      }
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar tarefa de revisão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ─── GET: obter tarefa de revisão para o lead ────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("contract_review_tasks")
      .select("*")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao buscar tarefa de revisão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
