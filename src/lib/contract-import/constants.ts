export const CONTRACT_IMPORT_BUCKET = "contract-import-documents";
export const CONTRACT_IMPORT_MAX_FILES = 20;
export const CONTRACT_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
export const CONTRACT_IMPORT_ALLOWED_EXTENSIONS = [".pdf"] as const;
export const CONTRACT_IMPORT_ALLOWED_MIME = new Set(["application/pdf"]);
export const CONTRACT_IMPORT_MIN_CHARS_PER_PAGE = 200;
export const CONTRACT_IMPORT_INPUT_CHAR_CAP = 80_000;
export const CONTRACT_IMPORT_MAX_TOKENS = 8192;
