import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { buildDueSharePointAgendamentoFields } from "@/modules/crm/application/services/build-due-sharepoint-agendamento-fields";
import { buildDueWhatsappMessage } from "@/modules/crm/application/services/build-due-whatsapp-message";
import { newLeadPayloadSchema } from "@/modules/crm/application/services/new-lead-payload";
import { EvolutionWhatsappConnector } from "@/modules/crm/infrastructure/integrations/evolution-whatsapp";
import { SharePointGraphClient } from "@/modules/crm/infrastructure/integrations/sharepoint-graph";
import { sendLeadNotificationEmail } from "@/modules/crm/application/services/send-lead-notification-email";
import { syncDueAreaTasksForOpportunity } from "@/lib/crm/due-area-tasks";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function updateSharePointAudit(
  supabase: SupabaseAdminClient,
  oportunidadeId: string,
  values: Pick<
    Database["public"]["Tables"]["lead_intakes"]["Update"],
    | "sharepoint_agendamento_id"
    | "sharepoint_agendamento_url"
    | "sharepoint_agendamento_error"
    | "sharepoint_agendamento_created_at"
  >,
) {
  const { error } = await supabase
    .from("lead_intakes")
    .update(values)
    .eq("oportunidade_id", oportunidadeId);

  return error?.message ?? null;
}

export async function POST(request: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = newLeadPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload inválido",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const payload = parsed.data;
    const supabase = createSupabaseAdminClient();

    const initialStage =
      payload.due_diligence === "Sim" ? "levantamento_dados" : "reuniao";

    const criadoPor = auth.profile?.id ?? null;
    const cadastradoPorEmail =
      auth.user.email?.trim().toLowerCase() ??
      payload.cadastrado_por.trim().toLowerCase();

    const firstCompany = payload.empresas[0];
    /** Nome exibido no pipeline / ficha: empresa ou pessoa do lead (não o colaborador interno). */
    const nomeLeadCadastro = firstCompany.razao_social.trim();

    const { data: oportunidade, error: oportunidadeError } = await supabase
      .from("oportunidades")
      .insert({
        tipo: "novo_lead",
        etapa: initialStage,
        havera_due_diligence: payload.due_diligence === "Sim",
        solicitante_nome: nomeLeadCadastro,
        solicitante_email: payload.email,
        criado_por: criadoPor,
        indicador_nome_digitado: payload.nome_indicacao?.trim() || null,
      })
      .select("id")
      .single();

    if (oportunidadeError || !oportunidade) {
      return NextResponse.json(
        { ok: false, error: oportunidadeError?.message ?? "Falha ao criar lead" },
        { status: 500 },
      );
    }
    const leadDetailsInsert: Database["public"]["Tables"]["lead_intakes"]["Insert"] = {
      oportunidade_id: oportunidade.id,
      solicitante_nome: payload.solicitante.trim(),
      cadastrado_por_email: cadastradoPorEmail,
      contexto_comercial: payload.contexto_comercial ?? null,
      due_diligence: payload.due_diligence === "Sim",
      data_entrega_due: payload.data_entrega_due ?? null,
      horario_entrega_due: payload.horario_entrega_due ?? null,
      empresas_json: payload.empresas,
      areas_analise: payload.areas_analise,
      local_reuniao: payload.local_reuniao,
      data_reuniao: payload.data_reuniao ?? null,
      horario_reuniao: payload.horario_reuniao ?? null,
      tipo_lead: payload.tipo_de_lead,
      tipo_indicacao: payload.tipo_indicacao ?? null,
      nome_indicacao: payload.nome_indicacao?.trim() || null,
    };

    const { error: leadDetailsError } = await supabase
      .from("lead_intakes")
      .insert(leadDetailsInsert);

    if (leadDetailsError) {
      return NextResponse.json(
        { ok: false, error: leadDetailsError.message },
        { status: 500 },
      );
    }

    if (payload.tipo_de_lead === "Indicacao" && payload.nome_indicacao?.trim()) {
      const normalizedName = payload.nome_indicacao.trim();
      const { data: existingIndicator } = await supabase
        .from("indicadores")
        .select("id, status")
        .ilike("nome", normalizedName)
        .limit(1)
        .maybeSingle();

      if (!existingIndicator) {
        const { data: createdIndicator } = await supabase
          .from("indicadores")
          .insert({
          nome: normalizedName,
          status: "pendente_aprovacao",
          })
          .select("id, nome")
          .maybeSingle();

        if (createdIndicator) {
          const { data: adminUsers } = await supabase
            .from("app_users")
            .select("id")
            .eq("role", "admin");

          if (adminUsers && adminUsers.length > 0) {
            const originado_por = actorFromAppUserRow(
              auth.profile
                ? {
                    id: auth.profile.id,
                    full_name: auth.profile.full_name,
                    avatar_url: auth.profile.avatar_url,
                  }
                : null,
            );
            await supabase.from("crm_in_app_notifications").insert(
              adminUsers.map((admin) => ({
                user_id: admin.id,
                tipo: "indicator_pending_approval",
                payload: {
                  title: "Novo indicador pendente de aprovação",
                  preview: createdIndicator.nome,
                  path: "/crm",
                  ...(originado_por ? { originado_por } : {}),
                },
              })),
            );
          }
        }
      }
    }

    const warnings: string[] = [];

    if (payload.due_diligence === "Sim") {
      try {
        await syncDueAreaTasksForOpportunity(supabase, oportunidade.id);
      } catch (error) {
        warnings.push(
          `Tarefas DUE: ${
            error instanceof Error
              ? error.message
              : "Falha ao gerar tarefas automáticas por área."
          }`,
        );
      }

      const { data: whatsappConfig, error: configError } = await supabase
        .from("whatsapp_due_config")
        .select("destination, is_active")
        .eq("is_active", true)
        .eq("use_case", "due_diligence")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!configError && whatsappConfig?.destination) {
        try {
          const connector = new EvolutionWhatsappConnector(
            process.env.EVOLUTION_API_URL ?? "",
            process.env.EVOLUTION_API_KEY ?? "",
            process.env.EVOLUTION_INSTANCE ?? process.env.EVOLUTION_INSTANCE_NAME ?? "BP",
          );

          const message = buildDueWhatsappMessage({
            ...payload,
            razao_social_completa: firstCompany.razao_social,
            cnpj_completo: firstCompany.documento,
          });

          await connector.sendText({
            destination: whatsappConfig.destination,
            text: message,
          });
        } catch (error) {
          warnings.push(
            `WhatsApp DUE: ${
              error instanceof Error
                ? error.message
                : "Falha ao enviar mensagem de due diligence."
            }`,
          );
        }
      } else {
        warnings.push(
          `WhatsApp DUE: ${
            configError?.message ?? "Configuração de destino WhatsApp não encontrada ou inativa."
          }`,
        );
      }

      try {
        const sharePointClient = SharePointGraphClient.fromEnv();
        const fields = buildDueSharePointAgendamentoFields(payload);
        const created = await sharePointClient.createListItem(fields);
        const auditError = await updateSharePointAudit(supabase, oportunidade.id, {
          sharepoint_agendamento_id: created.id,
          sharepoint_agendamento_url: created.webUrl ?? null,
          sharepoint_agendamento_error: null,
          sharepoint_agendamento_created_at: new Date().toISOString(),
        });

        if (auditError) {
          warnings.push(`SharePoint DUE: item criado, mas auditoria falhou (${auditError}).`);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao criar agendamento da due no SharePoint.";
        const auditError = await updateSharePointAudit(supabase, oportunidade.id, {
          sharepoint_agendamento_error: message,
          sharepoint_agendamento_created_at: null,
        });

        warnings.push(
          `SharePoint DUE: ${message}${
            auditError ? ` Auditoria também falhou (${auditError}).` : ""
          }`,
        );
      }
    }

    // Envio de e-mail de notificação (não-bloqueante)
    sendLeadNotificationEmail(supabase, payload).then((result) => {
      if (!result.ok) {
        console.warn("[leads/new] E-mail de notificação falhou:", result.error);
      }
    }).catch((err) => {
      console.error("[leads/new] Erro inesperado ao enviar e-mail:", err);
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          oportunidade_id: oportunidade.id,
        },
        warning: warnings.length > 0 ? warnings.join(" ") : null,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao criar lead.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
