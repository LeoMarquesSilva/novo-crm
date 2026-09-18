export const CONTRACT_IMPORT_BUCKET = "contract-import-documents";
export const CONTRACT_IMPORT_MAX_FILES = 20;
export const CONTRACT_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
export const CONTRACT_IMPORT_ALLOWED_EXTENSIONS = [".pdf"] as const;
export const CONTRACT_IMPORT_ALLOWED_MIME = new Set(["application/pdf"]);
export const CONTRACT_IMPORT_MIN_CHARS_PER_PAGE = 200;
export const CONTRACT_IMPORT_INPUT_CHAR_CAP = 80_000;
export const CONTRACT_IMPORT_MAX_TOKENS = 8192;
/** Raiz CNPJ da Bismarchi | Pires — nunca casar como cliente da carteira nem no rateio SIOE. */
export const OWN_LAW_FIRM_CNPJ_ROOTS = ["26080152"] as const;

export function isOwnLawFirmRoot(root: string | null | undefined): boolean {
  return Boolean(root && (OWN_LAW_FIRM_CNPJ_ROOTS as readonly string[]).includes(root));
}
