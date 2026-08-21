/**
 * Client server-side para o `official-photos-api` do ORQESTRAI.
 * Nunca importar deste módulo em código que roda no browser — a chave
 * (`OFFICIAL_PHOTOS_API_KEY`) só existe no runtime do servidor.
 * Contrato completo: docs/official-photos-consumer-playbook.md
 */

export type OfficialPhoto = {
  externalUserId: string | null;
  userId: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  source: "selected" | "legacy_avatar" | "none";
  version: string;
  updatedAt: string;
};

export type OfficialPhotosBatchResult = {
  data: OfficialPhoto[];
  notFound: string[];
};

const DEFAULT_BASE_URL =
  "https://qwihfvagemzlyypeohpc.supabase.co/functions/v1/official-photos-api";

/** Timeout curto — isto roda no caminho de autenticação de toda a página. */
const REQUEST_TIMEOUT_MS = 2500;

function baseUrl(): string {
  return process.env.ORQESTRAI_PHOTOS_URL?.trim() || DEFAULT_BASE_URL;
}

function apiKey(): string | null {
  const key = process.env.OFFICIAL_PHOTOS_API_KEY;
  return key?.trim() ? key.trim() : null;
}

/**
 * Busca fotos oficiais em lote (até 100 IDs por chamada — 1 chamada = 1 cota).
 * Nunca lança: qualquer falha (rede, timeout, 401/429/5xx) devolve `null` para
 * o chamador cair no fallback local (`avatar_url` do próprio banco).
 */
export async function fetchOfficialPhotosBatch(
  externalUserIds: string[],
): Promise<OfficialPhotosBatchResult | null> {
  const key = apiKey();
  const ids = [...new Set(externalUserIds.map((id) => id.trim()).filter(Boolean))];
  if (!key || ids.length === 0) return null;

  try {
    const response = await fetch(`${baseUrl()}/v1/photos/batch`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ externalUserIds: ids.slice(0, 100) }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    return (await response.json()) as OfficialPhotosBatchResult;
  } catch {
    return null;
  }
}
