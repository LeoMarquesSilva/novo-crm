import { extractDocumentIdentifiers } from "./document-text";
import { CONTRACT_IMPORT_CLIP_CHAR_CAP } from "./constants";

const PREAMBLE_CHARS = 6_000;
const WINDOW_CHARS = 800;

const CLIP_TERMS = [
  /honor[áa]rio/gi,
  /mensal/gi,
  /pasta/gi,
  /processo/gi,
  /hora/gi,
  /[êe]xito/gi,
  /reajuste/gi,
  /vig[êe]ncia/gi,
  /indeterminado/gi,
  /vencimento/gi,
  /\bkm\b/gi,
  /quilometr/gi,
  /[áa]rea/gi,
  /objeto/gi,
  /l[íi]quido/gi,
  /englobando tributos/gi,
  /quantidade/gi,
  /excedente/gi,
  /IGP-?M/gi,
  /IPCA/gi,
] as const;

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 40) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged;
}

export function clipContractTextForExtraction(input: {
  filename: string;
  text: string;
  cap?: number;
}): { text: string; documentIds: string[]; originalChars: number; clippedChars: number } {
  const body = input.text.trim();
  const cap = input.cap ?? CONTRACT_IMPORT_CLIP_CHAR_CAP;
  const documentIds = extractDocumentIdentifiers(body);
  const preamble = body.slice(0, Math.min(PREAMBLE_CHARS, body.length));
  const ranges: Array<{ start: number; end: number }> = [{ start: 0, end: preamble.length }];

  for (const term of CLIP_TERMS) {
    term.lastIndex = 0;
    for (const match of body.matchAll(term)) {
      const index = match.index ?? 0;
      ranges.push({
        start: Math.max(0, index - Math.floor(WINDOW_CHARS / 4)),
        end: Math.min(body.length, index + WINDOW_CHARS),
      });
    }
  }

  const windows = mergeRanges(ranges)
    .map((range) => body.slice(range.start, range.end).trim())
    .filter(Boolean);

  const clippedBody: string[] = [];
  const seen = new Set<string>();
  for (const window of windows) {
    const key = window.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    clippedBody.push(window);
  }

  const parts = [
    `Arquivo: ${input.filename}`,
    documentIds.length ? `Documentos encontrados no PDF: ${documentIds.join(", ")}` : null,
    "Trechos relevantes (não é o contrato inteiro):",
    clippedBody.join("\n\n[...]\n\n"),
  ].filter(Boolean);

  let text = parts.join("\n\n");
  if (text.length > cap) {
    text = `${text.slice(0, cap - 40)}\n\n[... texto limitado ...]`;
  }

  return {
    text,
    documentIds,
    originalChars: body.length,
    clippedChars: text.length,
  };
}
