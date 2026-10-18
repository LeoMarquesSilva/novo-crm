import { addCalendarDays } from "./contract-renewal-date";
import { isValidIsoDateString } from "./date-br";

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

export type DueDateFromText = {
  /** AAAA-MM-DD */
  date: string;
  /** `data`: o texto traz a data; `assinatura`: calculada a partir da data da assinatura. */
  basis: "data" | "assinatura";
};

function iso(year: number, month: number, day: number): string | null {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIsoDateString(value) ? value : null;
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function explicitDate(text: string): string | null {
  const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const br = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text);
  if (br) {
    const year = br[3]!.length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return iso(year, Number(br[2]), Number(br[1]));
  }

  const written = /\b(\d{1,2})\s*[ºo°]?\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/.exec(stripAccents(text).toLowerCase());
  if (written) {
    const month = MONTHS[written[2]!];
    return month ? iso(Number(written[3]), month, Number(written[1])) : null;
  }
  return null;
}

/**
 * Vencimento escrito na proposta em texto livre ("20/10/2026", "na data de assinatura do
 * Contrato", "30 dias após a assinatura") → data ISO. Datas relativas à assinatura só
 * saem quando ela é conhecida. Sem data reconhecível (ex.: "no mês seguinte") → null.
 */
export function parseDueDateText(
  text: string | null | undefined,
  options: { signedOn?: string | null } = {},
): DueDateFromText | null {
  const raw = text?.trim();
  if (!raw) return null;

  const explicit = explicitDate(raw);
  if (explicit) return { date: explicit, basis: "data" };

  const normalized = stripAccents(raw).toLowerCase();
  const signedOn = options.signedOn?.slice(0, 10) ?? null;
  if (!signedOn || !isValidIsoDateString(signedOn) || !/\bassinatura\b/.test(normalized)) return null;

  const afterDays = /\b(\d{1,3})\s*(?:\([^)]*\)\s*)?dias?\s+(corridos\s+|uteis\s+)?(?:apos|depois|contados|a\s+contar)\b/.exec(
    normalized,
  );
  if (afterDays) {
    if (afterDays[2]?.startsWith("uteis")) return null;
    const date = addCalendarDays(signedOn, Number(afterDays[1]));
    return date ? { date, basis: "assinatura" } : null;
  }
  if (/\d|seguinte|subsequente|apos|depois|posterior/.test(normalized)) return null;
  return { date: signedOn, basis: "assinatura" };
}
