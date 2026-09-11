import fs from "fs";
import path from "path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { PROPOSTA_INCLUDE_SINTESE_DEMANDA, type CanonicalProposalData } from "./proposta-docx-data";
import { buildPropostaWordBlocks } from "./proposta-word-blocks";

/** Nome fixo do template legado na pasta `public/` do Next. */
export const MODELO_PROPOSTA_FILENAME = "PROPOSTA-BP-V1.docx" as const;

/** Caminho absoluto do modelo Word usado na geração da proposta. */
export function resolveModeloPropostaTemplatePath(
  cwd: string = process.cwd(),
  templatePath: string = MODELO_PROPOSTA_FILENAME,
): string {
  // Compatibility alias for existing metadata rows; never read public templates.
  if (![MODELO_PROPOSTA_FILENAME, "MODELO-PROPOSTA-1.docx", "templates/proposta/PROPOSTA-BP-V1.docx"].includes(templatePath))
    throw new Error("Modelo da proposta não homologado. Use PROPOSTA-BP-V1.docx.");
  const p = path.resolve(cwd, "templates", "proposta", MODELO_PROPOSTA_FILENAME);
  if (fs.existsSync(p)) return p;
  throw new Error("Template oficial ausente em templates/proposta/PROPOSTA-BP-V1.docx.");
}

export function readModeloPropostaTemplateBuffer(cwd?: string, templatePath?: string): Buffer {
  const p = resolveModeloPropostaTemplatePath(cwd, templatePath);
  return fs.readFileSync(p);
}

export function renderCanonicalProposalDocx(data: CanonicalProposalData, templateBuffer = readModeloPropostaTemplateBuffer()): Buffer {
  const blocks = buildPropostaWordBlocks(data);
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "[", end: "]" }, paragraphLoop: true, linebreaks: true,
    nullGetter: () => "",
  });
  doc.render({ ...data.templateData, ESCOPO_AREAS: blocks.scope, INVESTIMENTO: blocks.investment });
  // PizZip assigns 'now' when docxtemplater replaces a part. Normalize ZIP dates
  // so identical data and template yield identical bytes for preview/download.
  for (const file of Object.values(doc.getZip().files)) file.date = new Date("2000-01-01T00:00:00Z");
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function paragraphPlainText(paragraphXml: string): string {
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraphXml))) {
    texts.push(match[1] ?? "");
  }
  return texts.join("").replace(/\s+/g, " ").trim();
}

function collectAreaHeadings(data: Record<string, string>): Set<string> {
  const labels = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (t) labels.add(t.toLocaleLowerCase("pt-BR"));
  };
  add(String(data.AREA ?? ""));
  for (const part of String(data.AREAS ?? "").split(/[,;]+/)) add(part);
  add("Investimento");
  return labels;
}

function restyleAreaHeadingParagraph(paragraphXml: string): string {
  let out = paragraphXml;
  if (/<w:jc\b/.test(out)) {
    out = out.replace(/<w:jc\b[^/]*\/>/g, '<w:jc w:val="left"/>');
  } else if (/<w:pPr>/i.test(out)) {
    out = out.replace(/<w:pPr>/i, '<w:pPr><w:jc w:val="left"/>');
  }
  out = out.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, (rPr) => {
    if (/<w:b\b/.test(rPr)) return rPr;
    return rPr.replace("<w:rPr>", "<w:rPr><w:b/><w:bCs/>");
  });
  return out;
}

const W_PARAGRAPH_SOURCE = "<w:p\\b[^>]*>[\\s\\S]*?</w:p>";
const SOFT_BR_SPLIT_SOURCE =
  "<w:r\\b[^>]*>\\s*(?:<w:rPr>(?:(?!</w:rPr>)[\\s\\S])*</w:rPr>\\s*)?<w:br\\b(?![^>]*w:type=\"(?:page|column)\")[^/]*/>\\s*</w:r>";

function hasSoftLineBreak(paragraph: string): boolean {
  return /<w:br\b(?![^>]*w:type="(?:page|column)")/.test(paragraph);
}

export function convertSoftBreaksToParagraphs(xml: string): string {
  return xml.replace(new RegExp(W_PARAGRAPH_SOURCE, "g"), (paragraph) => {
    if (!hasSoftLineBreak(paragraph)) return paragraph;
    const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const inner = paragraph.slice(open.length, paragraph.endsWith("</w:p>") ? -6 : undefined);
    const parts = inner.split(new RegExp(SOFT_BR_SPLIT_SOURCE, "g"));
    if (parts.length <= 1) return paragraph;
    return parts
      .map((part, index) => {
        const cleaned = part.replace(/<w:r\b[^>]*>\s*<\/w:r>/g, "").trim();
        const body = index === 0 ? (cleaned || part) : `${pPr}${cleaned}`;
        return `${open}${body}</w:p>`;
      })
      .join("");
  });
}

export function restyleMatchingAreaHeadings(xml: string, headings: Set<string>): string {
  if (headings.size === 0) return xml;
  return xml.replace(new RegExp(W_PARAGRAPH_SOURCE, "g"), (paragraph) => {
    const text = paragraphPlainText(paragraph);
    if (!text || !headings.has(text.toLocaleLowerCase("pt-BR"))) return paragraph;
    return restyleAreaHeadingParagraph(paragraph);
  });
}

function collectEscopoInlineLabels(data: Record<string, string>): string[] {
  return String(data.ESCOPO_SUBTIPO_LABELS ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function boldPrefixInParagraph(paragraph: string, label: string): string {
  return paragraph.replace(
    /<w:r(\b[^>]*)>([\s\S]*?)<w:t([^>]*)>([^<]*)<\/w:t>([\s\S]*?)<\/w:r>/,
    (full, rAttrs: string, beforeT: string, _tAttrs: string, tText: string, afterT: string) => {
      const lower = tText.toLocaleLowerCase("pt-BR");
      const labelLower = label.toLocaleLowerCase("pt-BR");
      let prefixLen = -1;
      if (lower.startsWith(`${labelLower}: `)) prefixLen = label.length + 2;
      else if (lower.startsWith(`${labelLower}:`)) prefixLen = label.length + 1;
      if (prefixLen < 0) return full;
      const prefix = tText.slice(0, prefixLen);
      const rest = tText.slice(prefixLen);
      const rPr = beforeT.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "<w:rPr></w:rPr>";
      const boldRPr = /<w:b\b/.test(rPr) ? rPr : rPr.replace("<w:rPr>", "<w:rPr><w:b/><w:bCs/>");
      const first = `<w:r${rAttrs}>${boldRPr}<w:t xml:space="preserve">${prefix}</w:t>${afterT}</w:r>`;
      const second = rest
        ? `<w:r${rAttrs}>${beforeT}<w:t xml:space="preserve">${rest}</w:t>${afterT}</w:r>`
        : "";
      return first + second;
    },
  );
}

export function boldLeadingLabelsInParagraphs(xml: string, labels: string[]): string {
  const sorted = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (sorted.length === 0) return xml;
  return xml.replace(new RegExp(W_PARAGRAPH_SOURCE, "g"), (paragraph) => {
    const text = paragraphPlainText(paragraph);
    const label = sorted.find((item) =>
      text.toLocaleLowerCase("pt-BR").startsWith(`${item.toLocaleLowerCase("pt-BR")}:`),
    );
    if (!label) return paragraph;
    return boldPrefixInParagraph(paragraph, label);
  });
}

/** Remove o parágrafo «Síntese da demanda…» do modelo Word (rótulo fixo + `[RESUMO]`). */
export function stripSinteseDemandaParagraphs(xml: string): string {
  return xml.replace(new RegExp(W_PARAGRAPH_SOURCE, "g"), (paragraph) => {
    const text = paragraphPlainText(paragraph).toLocaleLowerCase("pt-BR");
    if (text.startsWith("síntese da demanda")) return "";
    return paragraph;
  });
}

export function formatPropostaDocumentXml(xml: string, data: Record<string, string>): string {
  const withParagraphs = convertSoftBreaksToParagraphs(xml);
  const withInlineBold = boldLeadingLabelsInParagraphs(
    withParagraphs,
    collectEscopoInlineLabels(data),
  );
  const withHeadings = restyleMatchingAreaHeadings(withInlineBold, collectAreaHeadings(data));
  return PROPOSTA_INCLUDE_SINTESE_DEMANDA
    ? withHeadings
    : stripSinteseDemandaParagraphs(withHeadings);
}

/**
 * Substitui placeholders `[chave]` no .docx (conteúdo + rodapés).
 * `[P]` e `[F]` vêm dos dados (`buildPropostaDocxTemplateData`) como texto; no modelo atual
 * o rodapé usa caixa de texto e campos PAGE/NUMPAGES em OOXML podem corromper o arquivo.
 */
/** @deprecated Legacy renderer retained for regression tests. Use renderCanonicalProposalDocx. */
export function renderPropostaDocx(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "[", end: "]" },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  const outZip = doc.getZip();
  const documentXml = outZip.file("word/document.xml")?.asText();
  if (documentXml) {
    outZip.file("word/document.xml", formatPropostaDocumentXml(documentXml, data));
  }
  const out = outZip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
