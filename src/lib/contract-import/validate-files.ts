import { sanitizeFilenameForStorage } from "@/lib/scope-import/filename";
import {
  CONTRACT_IMPORT_ALLOWED_EXTENSIONS,
  CONTRACT_IMPORT_ALLOWED_MIME,
  CONTRACT_IMPORT_MAX_BYTES,
  CONTRACT_IMPORT_MAX_FILES,
} from "./constants";

export function validateContractImportFiles(
  files: Array<{ name: string; size: number; contentType: string }>,
): string | null {
  if (!files.length) return "Informe ao menos um PDF.";
  if (files.length > CONTRACT_IMPORT_MAX_FILES) {
    return `Máximo de ${CONTRACT_IMPORT_MAX_FILES} arquivos por lote.`;
  }
  for (const file of files) {
    const safeName = sanitizeFilenameForStorage(file.name);
    const ext = safeName.slice(safeName.lastIndexOf(".")).toLowerCase();
    if (!CONTRACT_IMPORT_ALLOWED_EXTENSIONS.includes(ext as (typeof CONTRACT_IMPORT_ALLOWED_EXTENSIONS)[number])) {
      return `Arquivo não suportado: ${file.name}. Use PDF.`;
    }
    if (file.size <= 0) return `Arquivo vazio: ${file.name}.`;
    if (file.size > CONTRACT_IMPORT_MAX_BYTES) {
      return `Arquivo muito grande: ${file.name} (máx. 25 MB).`;
    }
    const mime = (file.contentType || "").trim().toLowerCase();
    if (mime && !CONTRACT_IMPORT_ALLOWED_MIME.has(mime)) {
      return `Tipo MIME não suportado: ${file.name}.`;
    }
  }
  return null;
}
