/**
 * Variáveis de ambiente da integração D4Sign (API v1).
 * @see https://docapi.d4sign.com.br/docs/introdu%C3%A7%C3%A3o-a-api
 */
export type D4SignEnv = {
  tokenApi: string;
  cryptKey: string | undefined;
  apiBaseUrl: string;
  safeUuid: string;
  webhookHmacSecret: string | undefined;
};

export function getD4SignEnv(): D4SignEnv {
  const tokenApi = process.env.D4SIGN_TOKEN?.trim() ?? "";
  const cryptKey = process.env.D4SIGN_CRYPT_KEY?.trim() || undefined;
  const apiBaseUrl =
    process.env.D4SIGN_API_BASE_URL?.trim() || "https://secure.d4sign.com.br/api/v1";
  const safeUuid = process.env.D4SIGN_SAFE_UUID?.trim() ?? "";
  const webhookHmacSecret = process.env.D4SIGN_WEBHOOK_HMAC_SECRET?.trim() || undefined;
  return { tokenApi, cryptKey, apiBaseUrl, safeUuid, webhookHmacSecret };
}

export function assertD4SignSendEnv(): D4SignEnv {
  const env = getD4SignEnv();
  if (!env.tokenApi) {
    throw new Error("D4SIGN_TOKEN não configurado.");
  }
  if (!env.safeUuid) {
    throw new Error("D4SIGN_SAFE_UUID não configurado (UUID do cofre na D4Sign).");
  }
  return env;
}
