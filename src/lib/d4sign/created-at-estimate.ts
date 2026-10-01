/**
 * Data de criação de um documento D4Sign quando a API não informa.
 *
 * As listagens (`/safe`, `/status`) não trazem data. Duas fontes confiáveis:
 * 1. UUIDv7 — a D4Sign gera UUIDv7 desde set/2026; os 48 bits iniciais são
 *    o instante de criação em milissegundos.
 * 2. Nome do arquivo — o escritório nomeia "AAAA MM DD CONTRATO …".
 * Sem nenhuma das duas, devolve null (ordena por último).
 */

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_DATE = /^\s*(20\d{2})[\s._-]?(\d{2})[\s._-]?(\d{2})(?!\d)/;

/** Primeira data plausível para um contrato do escritório. */
const MIN_YEAR = 2015;

function plausible(date: Date, now: Date): boolean {
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() >= MIN_YEAR &&
    date.getTime() <= now.getTime() + 24 * 60 * 60 * 1000
  );
}

export function createdAtFromUuidV7(uuid: string, now = new Date()): string | null {
  if (!UUID_V7.test(uuid)) return null;
  const ms = Number.parseInt(uuid.replace(/-/g, "").slice(0, 12), 16);
  const date = new Date(ms);
  return plausible(date, now) ? date.toISOString() : null;
}

export function createdAtFromName(name: string | null | undefined, now = new Date()): string | null {
  const match = NAME_DATE.exec(name ?? "");
  if (!match) return null;
  const [, y, m, d] = match;
  // Meio-dia de Brasília: a data do nome não tem hora.
  const date = new Date(`${y}-${m}-${d}T15:00:00.000Z`);
  if (date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d)) return null;
  return plausible(date, now) ? date.toISOString() : null;
}

export function estimateD4SignCreatedAt(
  uuid: string,
  name: string | null | undefined,
  now = new Date(),
): string | null {
  return createdAtFromUuidV7(uuid, now) ?? createdAtFromName(name, now);
}
