import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function selectInstance(supabase: AdminClient, oportunidadeId: string, templateId: string) {
  const { data, error } = await supabase
    .from("document_instances")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Rascunho do documento (proposta ou contrato) do lead, criado na primeira vez.
 * A tela abre a aba com duas requisições ao mesmo tempo: as duas não acham o rascunho e
 * tentam criar; a segunda bate em `unique (oportunidade_id, template_id)` e lê o que a
 * primeira gravou, em vez de devolver 500.
 */
export async function ensureDocumentInstance(params: {
  supabase: AdminClient;
  oportunidadeId: string;
  templateId: string;
  appUserId: string | null;
}) {
  const { supabase, oportunidadeId, templateId, appUserId } = params;
  const existing = await selectInstance(supabase, oportunidadeId, templateId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("document_instances")
    .insert({
      oportunidade_id: oportunidadeId,
      template_id: templateId,
      status: "draft",
      current_version: 0,
      data_json: {},
      created_by: appUserId,
    })
    .select("*")
    .single();
  if (!error) return data;
  if (error.code === "23505") {
    const created = await selectInstance(supabase, oportunidadeId, templateId);
    if (created) return created;
  }
  throw error;
}
