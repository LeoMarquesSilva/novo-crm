import PizZip from "pizzip";
import { extractText, getDocumentProxy } from "unpdf";
import { SCOPE_IMPORT_MIN_CHARS_PER_PAGE } from "./constants";

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) return "";

  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paragraphs.map((paragraph) => {
    const runs = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
    return runs
      .map((run) => decodeXmlEntities(run.replace(/<[^>]+>/g, "")))
      .join("")
      .trim();
  });

  return lines.filter(Boolean).join("\n").trim();
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  return { text: merged.trim(), pageCount: totalPages ?? 1 };
}

export type DocumentTextResult = {
  text: string;
  pageCount: number;
  charsPerPage: number;
  isLikelyScanned: boolean;
};

export async function extractDocumentText(
  buffer: Buffer,
  contentType: string,
): Promise<DocumentTextResult> {
  const normalized = contentType.toLowerCase();
  let text = "";
  let pageCount = 1;

  if (
    normalized.includes("wordprocessingml") ||
    normalized.includes("msword") ||
    buffer.slice(0, 2).toString("utf8") === "PK"
  ) {
    text = extractDocxText(buffer);
    pageCount = Math.max(1, Math.ceil(text.length / 3000));
  } else if (normalized.includes("pdf") || buffer.slice(0, 4).toString("utf8") === "%PDF") {
    const pdf = await extractPdfText(buffer);
    text = pdf.text;
    pageCount = Math.max(1, pdf.pageCount);
  } else {
    throw new Error("Formato não suportado. Use PDF ou DOCX.");
  }

  const charsPerPage = pageCount > 0 ? text.length / pageCount : text.length;
  const isLikelyScanned = text.length > 0 && charsPerPage < SCOPE_IMPORT_MIN_CHARS_PER_PAGE;

  return { text, pageCount, charsPerPage, isLikelyScanned };
}
