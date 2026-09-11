import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Cópia de segurança dos documentos gerados (proposta e contrato) — o mesmo
 * `generated_file_path` já salvo em `document_versions`. */
export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

/**
 * Sobe uma cópia do documento gerado pro Storage do projeto. Best-effort: não
 * lança — o usuário já recebe o arquivo pelo download direto ou pelo envio ao
 * D4Sign; isso é só uma cópia própria a mais, não deve travar o fluxo principal
 * se o Storage falhar por qualquer motivo.
 */
export async function backupGeneratedDocument(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  filePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(filePath, bytes, { contentType, upsert: true });
    if (error) {
      console.warn(`[generated-document-storage] upload falhou para "${filePath}":`, error.message);
    }
  } catch (e) {
    console.warn(
      `[generated-document-storage] upload falhou para "${filePath}":`,
      e instanceof Error ? e.message : e,
    );
  }
}
