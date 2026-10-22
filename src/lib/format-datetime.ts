/** Fuso usado para instantes ISO (`timestamptz`, etc.) vindos em UTC. */
export const BR_TIMEZONE = "America/Sao_Paulo";

/** Primeiro dia da competência civil atual em São Paulo (`YYYY-MM-01`). */
export function competencyMonthStart(now = new Date(), timeZone = BR_TIMEZONE): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return `${formatted.slice(0, 7)}-01`;
}

const dateTimeBrFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BR_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Instante ISO 8601 → `dd/MM/yyyy HH:mm:ss` no horário de Brasília.
 */
export function formatDateTimeBr(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return dateTimeBrFormatter.format(d);
}

/**
 * Data de calendário `yyyy-mm-dd` (ex.: input type="date") → `dd/mm/yyyy`.
 * Não desloca o dia por UTC; interpreta como data civil.
 */
export function formatDateYmdBr(dateYmd: string | null | undefined): string {
  if (dateYmd == null || String(dateYmd).trim() === "") return "";
  const trimmed = String(dateYmd).trim();
  const head = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (!y || !mo || !day) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, mo - 1, day));
}

/**
 * Data digitada sem hora (`yyyy-mm-dd`, `dd/mm/aaaa` ou ISO com hora) → `yyyy-mm-dd`.
 * Valida o calendário; texto que não é data devolve `null`.
 */
export function parseDateOnlyInput(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(s);
  const [y, m, d] = br
    ? [Number(br[3]), Number(br[2]), Number(br[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [0, 0, 0];
  if (!y) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Diferença (em minutos) entre o relógio de `timeZone` e o UTC no instante dado. */
function timeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Data sem hora (`yyyy-mm-dd`) → instante ISO da meia-noite em São Paulo
 * (`2026-10-20` → `2026-10-20T03:00:00.000Z`). Gravar `T00:00Z` faz a data
 * aparecer um dia antes em quem está no Brasil.
 */
export function saoPauloMidnightIso(ymd: string, timeZone = BR_TIMEZONE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error(`Data inválida: ${ymd}`);
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const offset = timeZoneOffsetMinutes(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offset * 60_000).toISOString();
}

/** Dia civil (`yyyy-mm-dd`) de um instante no fuso de São Paulo. */
export function saoPauloDateYmd(at: Date = new Date(), timeZone = BR_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Dias corridos de `fromYmd` até `toYmd` (negativo se `toYmd` já passou). */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number | null {
  const from = parseDateOnlyInput(fromYmd);
  const to = parseDateOnlyInput(toYmd);
  if (!from || !to) return null;
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/**
 * Detecta string só com data/hora em formato internacional e exibe em pt-BR.
 * Texto livre ou já em dd/mm/yyyy permanece como está.
 */
export function formatMaybeDateLikeBr(raw: string): string {
  const s = String(raw).trim();
  if (!s) return s;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return formatDateYmdBr(s) || s;
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(s)) {
    return formatDateTimeBr(s);
  }

  return s;
}

/** `yyyy-mm-dd` → 8 dígitos `ddmmyyyy` (sem máscara). */
export function ymdToBrDateDigitString(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return "";
  return `${m[3]}${m[2]}${m[1]}`;
}

/** Formata até 8 dígitos como `dd/mm/aaaa` enquanto o usuário digita. */
export function maskBrDateDigitsInput(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Normaliza hora vinda de `HH:mm`, `HH:mm:ss` ou texto da BD para **`HH:mm`** (24h).
 */
export function normalizeTimeToHm(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "";
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
  if (!m) return "";
  let h = Number(m[1]);
  let min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return "";
  h = Math.max(0, Math.min(23, h));
  min = Math.max(0, Math.min(59, min));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Valida calendário e devolve `yyyy-mm-dd` ou `null`. */
export function parseBrDateDigitsToYmd(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const dd = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const yyyy = Number(d.slice(4, 8));
  if (yyyy < 1000 || yyyy > 9999) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
