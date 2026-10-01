/**
 * Log de eventos do PDF da D4Sign ("Eventos do documento", nas páginas finais
 * do certificado de assinaturas). A API não informa quem criou ou enviou o
 * documento; o log sim:
 *   "Documento {uuid} criado por NOME (uuid). Email:x@y. - DATE_ATOM: ..."
 *   "Assinaturas iniciadas por NOME (uuid). Email: x@y. - DATE_ATOM: ..."
 * "Assinaturas iniciadas" é o envio para assinatura (remetente).
 */
import { extractText, getDocumentProxy } from "unpdf";

export type D4SignLogActor = { name: string; email: string; at: string | null };

export type D4SignPdfLog = {
  createdBy: D4SignLogActor | null;
  sentBy: D4SignLogActor | null;
};

/** Junta quebras de linha e hífens de UUID partidos pela extração. */
function normalize(text: string): string {
  return text
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\s+/g, " ");
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => (["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function iso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function actor(text: string, prefix: RegExp): D4SignLogActor | null {
  const re = new RegExp(
    `${prefix.source}\\s+(.+?)\\s*\\([0-9a-f-\\s]{20,}\\)\\.?\\s*Email:\\s*([^\\s]+?@[^\\s]+?)\\.?\\s+-\\s*DATE_ATOM:\\s*([0-9T:+\\-]+)`,
    "i",
  );
  const match = re.exec(text);
  if (!match) return null;
  return { name: titleCase(match[1].trim()), email: match[2].toLowerCase(), at: iso(match[3]) };
}

export function parseD4SignPdfLog(rawText: string): D4SignPdfLog {
  const text = normalize(rawText);
  return {
    createdBy: actor(text, /Documento\s+[0-9a-f-]{36}\s+criado\s+por/),
    sentBy: actor(text, /Assinaturas\s+iniciadas\s+por/),
  };
}

/** Extrai o log das páginas finais do PDF (onde a D4Sign põe os eventos). */
export async function readD4SignPdfLog(bytes: ArrayBuffer | Uint8Array): Promise<D4SignPdfLog> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes.slice(0)));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text ?? "")];
  return parseD4SignPdfLog(pages.slice(-4).join("\n"));
}
