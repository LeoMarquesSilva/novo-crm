/** Fuso usado para instantes ISO (`timestamptz`, etc.) vindos em UTC. */
export const BR_TIMEZONE = "America/Sao_Paulo";

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
