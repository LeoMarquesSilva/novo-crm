import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Cópia de segurança dos documentos gerados (proposta e contrato) — o mesmo
 * `generated_file_path` já salvo em `document_versions`. */
export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

function storagePathParts(path: string): { folder: string; filename: string } {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const separator = normalized.lastIndexOf("/");
  if (separator < 0) return { folder: "", filename: normalized };
  return {
    folder: normalized.slice(0, separator),
    filename: normalized.slice(separator + 1),
  };
}

export async function generatedDocumentObjectExists(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  filePath: string,
): Promise<boolean> {
  const { folder, filename } = storagePathParts(filePath);
  if (!filename) return false;

  const { data, error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .list(folder, { limit: 100, search: filename });

  if (error) {
    throw new Error(`Não foi possível validar o documento no Storage: ${error.message}`);
  }

  return (data ?? []).some((item) => item.name === filename);
}

export async function enrichGeneratedDocumentVersions<
  T extends { generated_file_path: string | null },
>(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  versions: T[],
): Promise<Array<T & { file_available: boolean }>> {
  return Promise.all(
    versions.map(async (version) => ({
      ...version,
      file_available: version.generated_file_path
        ? await generatedDocumentObjectExists(supabase, version.generated_file_path)
        : false,
    })),
  );
}

/**
 * Persiste um documento que faz parte do fluxo oficial do CRM.
 *
 * Diferente do backup best-effort, esta função falha quando o Storage não
 * confirma o upload. Assim, nenhuma versão pode ser tratada como gerada sem
 * que o arquivo exista no bucket vinculado à oportunidade.
 */
export async function storeGeneratedDocument(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  filePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .upload(filePath, bytes, { contentType, upsert: true });

  if (error) {
    throw new Error(`Não foi possível armazenar o documento gerado: ${error.message}`);
  }
}

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
    await storeGeneratedDocument(supabase, filePath, bytes, contentType);
  } catch (e) {
    console.warn(
      `[generated-document-storage] upload falhou para "${filePath}":`,
      e instanceof Error ? e.message : e,
    );
  }
}
