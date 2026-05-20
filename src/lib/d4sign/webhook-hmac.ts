import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o cabeçalho Content-Hmac da D4Sign (HMAC-SHA256 do UUID do documento).
 * @see https://docapi.d4sign.com.br/docs/seguran%C3%A7a-de-webhook
 */
export function verifyD4SignContentHmac(
  documentUuid: string,
  secret: string,
  contentHmacHeader: string | null,
): boolean {
  if (!secret || !contentHmacHeader) {
    return false;
  }
  const normalized = contentHmacHeader.trim().replace(/^sha256=/i, "").trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    return false;
  }
  const expectedHex = createHmac("sha256", secret).update(documentUuid, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(normalized, "hex"));
  } catch {
    return false;
  }
}
