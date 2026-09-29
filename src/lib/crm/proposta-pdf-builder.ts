import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type Color, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import {
  PROPOSTA_INVESTIMENTO_HEADING,
  stripInvestimentoSectionHeading,
  type CanonicalProposalData,
} from "./proposta-docx-data";

/** Páginas de `assets/proposta-pdf/proposta-modelo.pdf` (gerado por `scripts/prepare-proposta-pdf-assets.py`). */
export const PROPOSTA_MODELO_PAGE = {
  capa: 0,
  institucional: 1,
  timbrado: 2,
  cvGustavo: 3,
  cvRicardo: 4,
  assinaturas: 5,
  contracapa: 6,
} as const;

const FONT_FILES = {
  serif: "LiberationSerif-Regular.ttf",
  serifBold: "LiberationSerif-Bold.ttf",
  garamond: "EBGaramond-Regular.ttf",
  montserrat: "Montserrat-Regular.ttf",
  montserratBold: "Montserrat-Bold.ttf",
  sans: "Inter-Regular.ttf",
} as const;

type FontKey = keyof typeof FONT_FILES;

export type PropostaPdfAssets = { modelo: Uint8Array; fonts: Record<FontKey, Uint8Array> };

let cachedAssets: { dir: string; assets: PropostaPdfAssets } | null = null;

export function readPropostaPdfAssets(cwd: string = process.cwd()): PropostaPdfAssets {
  const dir = path.resolve(cwd, "assets", "proposta-pdf");
  if (cachedAssets?.dir === dir) return cachedAssets.assets;
  const read = (...parts: string[]) => {
    const file = path.join(dir, ...parts);
    if (!fs.existsSync(file)) throw new Error(`Arquivo do modelo PDF ausente: assets/proposta-pdf/${parts.join("/")}.`);
    return fs.readFileSync(file);
  };
  const fonts = {} as Record<FontKey, Uint8Array>;
  for (const key of Object.keys(FONT_FILES) as FontKey[]) fonts[key] = read("fonts", FONT_FILES[key]);
  const assets = { modelo: read("proposta-modelo.pdf"), fonts };
  cachedAssets = { dir, assets };
  return assets;
}

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const GOLD = rgb(0xd5 / 255, 0xb1 / 255, 0x70 / 255);

/** Coordenadas medidas no guia (origem no topo, em pt). */
const CAPA = {
  clienteX: 83.76, clienteBaseline: 435.36, clienteSize: 36, clienteMinSize: 24, clienteMaxLines: 3, clienteMaxWidth: 455,
  enviadoX: 83.76, enviadoBaseline: 651.6,
  dataX: 84.72, dataBaseline: 678,
  metaSize: 12,
};
const VIGENCIA = { x: 210.8, baseline: 221.52, size: 12, maxWidth: 176 };

/** Margens do Word (pgMar 1417/1701 twips) e ritmo do estilo BPScopeBody (TNR 12, linha 278/240, depois 8 pt). */
const BODY = {
  left: 85.05, right: 85.05, top: 70.85, bottom: 70.85,
  size: 12, headingSize: 14,
  lineFactor: 1.149 * (278 / 240),
  ascent: 0.891,
  spaceAfter: 8,
};

type Run = { text: string; font: PDFFont };
type Piece = Run & { width: number };
type Word = { pieces: Piece[]; width: number };
type Block = {
  runs: Run[];
  size: number;
  justify: boolean;
  keepWithNext?: boolean;
  spaceBefore?: number;
};

function cleanText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
}

function toWords(runs: Run[], size: number, maxWidth: number): Word[] {
  const words: Word[] = [];
  let current: Piece[] = [];
  const flush = () => {
    if (current.length) words.push({ pieces: current, width: current.reduce((sum, p) => sum + p.width, 0) });
    current = [];
  };
  for (const run of runs) {
    for (const token of run.text.split(/(\s+)/)) {
      if (!token) continue;
      if (/^\s+$/.test(token)) { flush(); continue; }
      current.push({ text: token, font: run.font, width: run.font.widthOfTextAtSize(token, size) });
    }
  }
  flush();
  return words.flatMap(word => (word.width <= maxWidth ? [word] : splitLongWord(word, size, maxWidth)));
}

function splitLongWord(word: Word, size: number, maxWidth: number): Word[] {
  const out: Word[] = [];
  let pieces: Piece[] = [];
  let width = 0;
  for (const piece of word.pieces) {
    for (const char of Array.from(piece.text)) {
      const w = piece.font.widthOfTextAtSize(char, size);
      if (width + w > maxWidth && pieces.length) {
        out.push({ pieces, width });
        pieces = [];
        width = 0;
      }
      const last = pieces[pieces.length - 1];
      if (last && last.font === piece.font) { last.text += char; last.width += w; } else pieces.push({ text: char, font: piece.font, width: w });
      width += w;
    }
  }
  if (pieces.length) out.push({ pieces, width });
  return out;
}

function breakLines(words: Word[], spaceWidth: number, maxWidth: number): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0;
  for (const word of words) {
    const next = line.length ? width + spaceWidth + word.width : word.width;
    if (line.length && next > maxWidth) {
      lines.push(line);
      line = [word];
      width = word.width;
    } else {
      line.push(word);
      width = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawLine(page: PDFPage, line: Word[], opts: {
  x: number; y: number; size: number; spaceWidth: number; maxWidth: number; justify: boolean; color: Color;
}) {
  const wordsWidth = line.reduce((sum, word) => sum + word.width, 0);
  const gap = opts.justify && line.length > 1 ? (opts.maxWidth - wordsWidth) / (line.length - 1) : opts.spaceWidth;
  let x = opts.x;
  for (const word of line) {
    for (const piece of word.pieces) {
      page.drawText(piece.text, { x, y: opts.y, size: opts.size, font: piece.font, color: opts.color });
      x += piece.width;
    }
    x += gap;
  }
}

function buildContentBlocks(data: CanonicalProposalData, fonts: { regular: PDFFont; bold: PDFFont }): Block[] {
  const blocks: Block[] = [];
  const heading = (text: string, spaceBefore = 0): Block =>
    ({ runs: [{ text, font: fonts.bold }], size: BODY.headingSize, justify: false, keepWithNext: true, spaceBefore });
  let lastArea = "";
  for (const section of data.escopoSections) {
    if (section.areaLabel !== lastArea) {
      blocks.push(heading(cleanText(section.areaLabel)));
      lastArea = section.areaLabel;
    }
    const paragraphs = section.text.split(/\n\s*\n/).map(cleanText).filter(Boolean);
    paragraphs.forEach((text, index) => {
      const runs: Run[] = [];
      if (index === 0 && section.scopeTypeLabel) runs.push({ text: `${cleanText(section.scopeTypeLabel)}: `, font: fonts.bold });
      runs.push({ text, font: fonts.regular });
      blocks.push({ runs, size: BODY.size, justify: true });
    });
  }
  const investment = stripInvestimentoSectionHeading(data.templateData.INVESTIMENTO ?? "");
  if (investment) {
    // The Word template keeps an empty 14 pt paragraph between scope and investment.
    const gap = blocks.length ? BODY.headingSize * BODY.lineFactor + BODY.spaceAfter : 0;
    blocks.push(heading(PROPOSTA_INVESTIMENTO_HEADING, gap));
    for (const text of investment.split(/\n\s*\n/).map(cleanText).filter(Boolean)) {
      blocks.push({ runs: [{ text, font: fonts.regular }], size: BODY.size, justify: true });
    }
  }
  return blocks;
}

function layoutContentPages(out: PDFDocument, background: PDFEmbeddedPage, blocks: Block[], fonts: { regular: PDFFont }) {
  const { width: pageWidth, height: pageHeight } = background;
  const maxWidth = pageWidth - BODY.left - BODY.right;
  const bottomLimit = pageHeight - BODY.bottom;
  let page: PDFPage | null = null;
  let cursor = BODY.top;

  const newPage = () => {
    page = out.addPage([pageWidth, pageHeight]);
    page.drawPage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    cursor = BODY.top;
    return page;
  };
  const current = () => page ?? newPage();

  const laidOut = blocks.map(block => {
    const spaceWidth = fonts.regular.widthOfTextAtSize(" ", block.size);
    const lines = breakLines(toWords(block.runs, block.size, maxWidth), spaceWidth, maxWidth);
    return { block, lines, spaceWidth, lineHeight: block.size * BODY.lineFactor };
  });

  laidOut.forEach((item, index) => {
    current();
    const atTop = cursor === BODY.top;
    if (!atTop) cursor += item.block.spaceBefore ?? 0;
    if (item.block.keepWithNext && !atTop) {
      const next = laidOut[index + 1];
      const needed = item.lines.length * item.lineHeight + (next ? BODY.spaceAfter + Math.min(2, next.lines.length) * next.lineHeight : 0);
      if (cursor + needed > bottomLimit) newPage();
    }
    item.lines.forEach((line, lineIndex) => {
      if (cursor + item.lineHeight > bottomLimit && cursor > BODY.top) newPage();
      const target = current();
      drawLine(target, line, {
        x: BODY.left,
        y: pageHeight - (cursor + BODY.ascent * item.block.size),
        size: item.block.size,
        spaceWidth: item.spaceWidth,
        maxWidth,
        justify: item.block.justify && lineIndex < item.lines.length - 1,
        color: BLACK,
      });
      cursor += item.lineHeight;
    });
    cursor += BODY.spaceAfter;
  });
  current();
}

function drawCapa(page: PDFPage, data: CanonicalProposalData, fonts: { garamond: PDFFont; montserrat: PDFFont; montserratBold: PDFFont }) {
  const height = page.getHeight();
  const cliente = cleanText(data.templateData.EMPRESA ?? "").toLocaleUpperCase("pt-BR");
  if (cliente) {
    let size = CAPA.clienteSize;
    let lines: Word[][] = [];
    for (; size >= CAPA.clienteMinSize; size -= 2) {
      const spaceWidth = fonts.garamond.widthOfTextAtSize(" ", size);
      lines = breakLines(toWords([{ text: cliente, font: fonts.garamond }], size, CAPA.clienteMaxWidth), spaceWidth, CAPA.clienteMaxWidth);
      if (lines.length <= CAPA.clienteMaxLines) break;
    }
    size = Math.max(size, CAPA.clienteMinSize);
    const spaceWidth = fonts.garamond.widthOfTextAtSize(" ", size);
    lines.forEach((line, index) => drawLine(page, line, {
      x: CAPA.clienteX, y: height - (CAPA.clienteBaseline + index * size * 1.05),
      size, spaceWidth, maxWidth: CAPA.clienteMaxWidth, justify: false, color: GOLD,
    }));
  }

  const responsavel = cleanText(data.templateData.RESPONSAVEL ?? "");
  if (responsavel) {
    const label = "Enviado por:";
    page.drawText(label, { x: CAPA.enviadoX, y: height - CAPA.enviadoBaseline, size: CAPA.metaSize, font: fonts.montserratBold, color: WHITE });
    page.drawText(` ${responsavel}`, {
      x: CAPA.enviadoX + fonts.montserratBold.widthOfTextAtSize(label, CAPA.metaSize),
      y: height - CAPA.enviadoBaseline, size: CAPA.metaSize, font: fonts.montserrat, color: WHITE,
    });
  }
  const dataProposta = cleanText(data.templateData.DATA_PROPOSTA ?? "");
  page.drawText(dataProposta ? `Campinas/SP, ${dataProposta}` : "Campinas/SP", {
    x: CAPA.dataX, y: height - CAPA.dataBaseline, size: CAPA.metaSize, font: fonts.montserrat, color: WHITE,
  });
}

function drawVigencia(page: PDFPage, data: CanonicalProposalData, font: PDFFont) {
  const vigencia = cleanText(data.templateData.DATA_VIGENCIA ?? "");
  if (!vigencia) return;
  const text = `Vigência da Proposta: ${vigencia}`;
  const size = Math.min(VIGENCIA.size, (VIGENCIA.size * VIGENCIA.maxWidth) / font.widthOfTextAtSize(text, VIGENCIA.size));
  page.drawText(text, { x: VIGENCIA.x, y: page.getHeight() - VIGENCIA.baseline, size, font, color: BLACK });
}

/**
 * Proposta em PDF montada direto do modelo BP: capa, institucional, páginas de conteúdo no timbrado
 * (escopo por área + investimento), CV Gustavo, CV Ricardo, assinaturas com vigência e contracapa.
 */
export async function buildPropostaPdf(data: CanonicalProposalData, assets: PropostaPdfAssets = readPropostaPdfAssets()): Promise<Uint8Array> {
  const modelo = await PDFDocument.load(assets.modelo);
  const out = await PDFDocument.create({ updateMetadata: false });
  out.registerFontkit(fontkit);
  const embed = (key: FontKey) => out.embedFont(assets.fonts[key], { subset: true });
  const [serif, serifBold, garamond, montserrat, montserratBold, sans] = await Promise.all(
    (["serif", "serifBold", "garamond", "montserrat", "montserratBold", "sans"] as const).map(embed),
  );

  const P = PROPOSTA_MODELO_PAGE;
  const [capa, institucional, cvGustavo, cvRicardo, assinaturas, contracapa] = await out.copyPages(
    modelo, [P.capa, P.institucional, P.cvGustavo, P.cvRicardo, P.assinaturas, P.contracapa],
  );
  const timbrado = await out.embedPage(modelo.getPage(P.timbrado));

  out.addPage(capa);
  drawCapa(capa, data, { garamond, montserrat, montserratBold });
  out.addPage(institucional);
  layoutContentPages(out, timbrado, buildContentBlocks(data, { regular: serif, bold: serifBold }), { regular: serif });
  out.addPage(cvGustavo);
  out.addPage(cvRicardo);
  out.addPage(assinaturas);
  drawVigencia(assinaturas, data, sans);
  out.addPage(contracapa);

  const empresa = cleanText(data.templateData.EMPRESA ?? "");
  const generatedAt = new Date(data.generatedAt);
  out.setTitle(empresa ? `Proposta de Serviços Jurídicos – ${empresa}` : "Proposta de Serviços Jurídicos");
  out.setAuthor("Bismarchi | Pires Sociedade de Advogados");
  out.setCreator("CRM Bismarchi | Pires");
  out.setProducer("CRM Bismarchi | Pires");
  out.setLanguage("pt-BR");
  if (!Number.isNaN(generatedAt.getTime())) {
    out.setCreationDate(generatedAt);
    out.setModificationDate(generatedAt);
  }
  return out.save();
}
