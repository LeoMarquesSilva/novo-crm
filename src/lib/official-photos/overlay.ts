import { fetchOfficialPhotosBatch } from "./client";

type CacheEntry = { photoUrl: string | null; fetchedAt: number };

/** Cache em memória do processo — best effort, evita bater na API a cada request. */
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function withVersion(photoUrl: string, version: string): string {
  const sep = photoUrl.includes("?") ? "&" : "?";
  return `${photoUrl}${sep}v=${encodeURIComponent(version)}`;
}

/**
 * Resolve `app_users.id` (externalUserId) → URL da foto oficial, com cache
 * curto de processo e `?v=version` para invalidar o cache do browser quando
 * a foto muda. Retorna `null` para quem não tem vínculo/foto — o chamador
 * deve manter o `avatar_url` local como fallback nesse caso.
 */
export async function resolveOfficialAvatarUrls(
  externalUserIds: string[],
): Promise<Map<string, string | null>> {
  const now = Date.now();
  const ids = [...new Set(externalUserIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string | null>();
  const stale: string[] = [];

  for (const id of ids) {
    const cached = cache.get(id);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      result.set(id, cached.photoUrl);
    } else {
      stale.push(id);
    }
  }

  if (stale.length > 0) {
    const batch = await fetchOfficialPhotosBatch(stale);
    if (batch) {
      const byId = new Map(batch.data.map((photo) => [photo.externalUserId, photo]));
      for (const id of stale) {
        const photo = byId.get(id);
        const url =
          photo?.photoUrl && photo.source !== "none"
            ? withVersion(photo.photoUrl, photo.version)
            : null;
        cache.set(id, { photoUrl: url, fetchedAt: now });
        result.set(id, url);
      }
    } else {
      // API indisponível (429/5xx/timeout): mantém cache antigo se existir,
      // sem "envenenar" com null nem derrubar a resolução dos demais IDs.
      for (const id of stale) {
        result.set(id, cache.get(id)?.photoUrl ?? null);
      }
    }
  }

  return result;
}

type WithAvatar = { id: string; avatarUrl: string | null };

/**
 * Sobrepõe a foto oficial (quando existir) sobre `avatarUrl`. Sem vínculo
 * ou com a API fora do ar, o `avatarUrl` local (cadastro do próprio CRM)
 * permanece como fallback — nunca vira `null`/vazio por causa disto.
 */
export async function overlayOfficialAvatars<T extends WithAvatar>(users: T[]): Promise<T[]> {
  if (users.length === 0) return users;
  const official = await resolveOfficialAvatarUrls(users.map((user) => user.id));
  return users.map((user) => {
    const officialUrl = official.get(user.id);
    return officialUrl ? { ...user, avatarUrl: officialUrl } : user;
  });
}
