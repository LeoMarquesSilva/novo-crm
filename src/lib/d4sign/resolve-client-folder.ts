import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

/**
 * Resolve a pasta do cofre D4Sign onde um contrato deste cliente deve ser
 * arquivado — mesma convenção das ~43 pastas-cliente já existentes no cofre
 * (nome do cliente, direto na raiz, sem pasta de área).
 *
 * 1. Procura no banco local (`d4sign_documents`, já populado pelo sync do
 *    cofre) uma pasta com esse nome — sem custo de requisição à API.
 * 2. Se não achar, cria a pasta na D4Sign (1 requisição) e retorna o novo uuid.
 *
 * Antes desta correção, o envio de contratos pelo CRM nunca informava pasta
 * nenhuma — todo documento caía solto na raiz do cofre, diferente do resto do
 * acervo (organizado por cliente).
 */
export async function resolveClientFolder(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  connector: D4SignConnector;
  safeUuid: string;
  clientName: string;
}): Promise<{ uuid: string; name: string } | null> {
  const clientName = params.clientName.trim();
  if (!clientName) return null;

  const { data: existing } = await params.supabase
    .from("d4sign_documents")
    .select("folder_uuid, folder_name")
    .not("folder_uuid", "is", null)
    .ilike("folder_name", clientName)
    .limit(1)
    .maybeSingle();

  if (existing?.folder_uuid) {
    return { uuid: existing.folder_uuid, name: existing.folder_name ?? clientName };
  }

  const uuid = await params.connector.createFolder(params.safeUuid, clientName);
  return { uuid, name: clientName };
}
