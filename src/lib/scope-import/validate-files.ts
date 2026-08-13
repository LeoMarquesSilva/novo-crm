import { sanitizeFilenameForStorage } from "@/lib/scope-import/filename";
import {
  SCOPE_IMPORT_ALLOWED_EXTENSIONS,
  SCOPE_IMPORT_ALLOWED_MIME,
  SCOPE_IMPORT_MAX_BYTES,
  SCOPE_IMPORT_MAX_FILES,
} from "./constants";

export type ScopeImportFileInput = {
  name: string;
  size: number;
  contentType: string;
};

export function validateScopeImportFiles(files: ScopeImportFileInput[]): string | null {
  if (!files.length) return "Informe ao menos um arquivo.";
  if (files.length > SCOPE_IMPORT_MAX_FILES) {
    return `Máximo de ${SCOPE_IMPORT_MAX_FILES} arquivos por lote.`;
  }

  for (const file of files) {
    const safeName = sanitizeFilenameForStorage(file.name);
    const ext = safeName.slice(safeName.lastIndexOf(".")).toLowerCase();
    if (!SCOPE_IMPORT_ALLOWED_EXTENSIONS.includes(ext as (typeof SCOPE_IMPORT_ALLOWED_EXTENSIONS)[number])) {
      return `Arquivo não suportado: ${file.name}. Use PDF ou DOCX.`;
    }
    if (file.size <= 0) return `Arquivo vazio: ${file.name}.`;
    if (file.size > SCOPE_IMPORT_MAX_BYTES) {
      return `Arquivo muito grande: ${file.name} (máx. 25 MB).`;
    }
    const mime = (file.contentType || "").trim().toLowerCase();
    if (mime && !SCOPE_IMPORT_ALLOWED_MIME.has(mime)) {
      return `Tipo MIME não suportado: ${file.name}.`;
    }
  }

  return null;
}
