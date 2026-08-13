import { createHash, timingSafeEqual } from "node:crypto";

const D4SIGN_TYPE_POSTS = new Set(["1", "2", "3", "4"]);

export function verifySharedSecret(
  expected: string | null | undefined,
  supplied: string | null | undefined,
): boolean {
  if (!expected?.trim() || !supplied?.trim()) {
    return false;
  }

  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  const suppliedHash = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

export function isPayloadLengthAllowed(
  contentLength: string | null,
  maxBytes: number,
): boolean {
  if (contentLength === null) {
    return true;
  }

  if (!/^\d+$/.test(contentLength)) {
    return false;
  }

  const bytes = Number(contentLength);
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= maxBytes;
}

export function isAllowedD4SignTypePost(typePost: string): boolean {
  return D4SIGN_TYPE_POSTS.has(typePost);
}
