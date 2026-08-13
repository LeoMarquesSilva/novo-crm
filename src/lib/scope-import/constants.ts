export const SCOPE_IMPORT_BUCKET = "scope-import-documents";

export const SCOPE_IMPORT_MAX_FILES = 40;
export const SCOPE_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

export const SCOPE_IMPORT_ALLOWED_EXTENSIONS = [".pdf", ".docx"] as const;

export const SCOPE_IMPORT_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const SCOPE_IMPORT_MIN_CHARS_PER_PAGE = 200;

export const SCOPE_IMPORT_INPUT_CHAR_CAP = 60_000;

export const SCOPE_IMPORT_EXTRACTION_MAX_TOKENS = 4096;
export const SCOPE_IMPORT_CONSOLIDATION_MAX_TOKENS = 8192;

export const SCOPE_IMPORT_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
