import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actorFromAppUserRow,
  type AppUserActorRow,
} from "@/lib/crm/in-app-notification-meta";
import { isCollaboratorIndicationType } from "@/lib/crm/indication-name-options";

export async function ensurePendingIndicator(input: {
  supabase: SupabaseClient;
  nome: string;
  actor?: AppUserActorRow | null;
  previewSuffix?: string;
}): Promise<{ created: boolean; nome: string }> {
  const normalizedName = input.nome.trim();
  if (!normalizedName) return { created: false, nome: "" };

  const { data: existingIndicator } = await input.supabase
    .from("indicadores")
    .select("id, status")
    .ilike("nome", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existingIndicator) return { created: false, nome: normalizedName };

  const { data: createdIndicator } = await input.supabase
    .from("indicadores")
    .insert({
      nome: normalizedName,
      status: "pendente_aprovacao",
    })
    .select("id, nome")
    .maybeSingle();

  if (!createdIndicator) return { created: false, nome: normalizedName };

  const { data: adminUsers } = await input.supabase.from("app_users").select("id").eq("role", "admin");
  if (adminUsers && adminUsers.length > 0) {
    const originado_por = actorFromAppUserRow(input.actor ?? null);
    const preview = input.previewSuffix
      ? `${createdIndicator.nome} · ${input.previewSuffix}`
      : createdIndicator.nome;
    await input.supabase.from("crm_in_app_notifications").insert(
      adminUsers.map((admin) => ({
        user_id: admin.id,
        tipo: "indicator_pending_approval",
        payload: {
          title: "Novo indicador pendente de aprovação",
          preview,
          path: "/crm",
          ...(originado_por ? { originado_por } : {}),
        },
      })),
    );
  }

  return { created: true, nome: createdIndicator.nome };
}

export async function requestIndicatorApprovalIfNew(input: {
  supabase: SupabaseClient;
  tipoLead: string;
  tipoIndicacao?: string | null;
  nomeIndicacao?: string | null;
  actor?: AppUserActorRow | null;
  previewSuffix?: string;
}): Promise<{ created: boolean; nome: string }> {
  if (input.tipoLead !== "Indicacao") return { created: false, nome: "" };
  if (isCollaboratorIndicationType(input.tipoIndicacao)) {
    return { created: false, nome: (input.nomeIndicacao ?? "").trim() };
  }
  return ensurePendingIndicator({
    supabase: input.supabase,
    nome: input.nomeIndicacao ?? "",
    actor: input.actor,
    previewSuffix: input.previewSuffix,
  });
}
