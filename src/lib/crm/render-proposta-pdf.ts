import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { EscopoPreviewSection, PropostaDocumentPagePreview } from "@/lib/crm/proposta-docx-data";
import { PROPOSTA_INCLUDE_SINTESE_DEMANDA, PROPOSTA_INVESTIMENTO_HEADING } from "@/lib/crm/proposta-docx-data";

function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n\n+/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) return [];
      if (!trimmed.includes("\n")) return [trimmed];
      return trimmed
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    });
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 48;
const NAVY = rgb(13 / 255, 32 / 255, 49 / 255);
const GOLD = rgb(211 / 255, 173 / 255, 103 / 255);
const TEXT = rgb(17 / 255, 24 / 255, 39 / 255);
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255);

function toPdfSafe(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = toPdfSafe(text).replace(/\s+/g, " ").trim();
  if (!safe) return [];
  const words = safe.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function groupEscopoSectionsByArea(sections: EscopoPreviewSection[]) {
  const groups: Array<{ area: string; items: EscopoPreviewSection[] }> = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if (last && last.area === section.areaLabel) last.items.push(section);
    else groups.push({ area: section.areaLabel, items: [section] });
  }
  return groups;
}

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
};

function ensureSpace(ctx: DrawCtx, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - 78;
}

function drawLines(
  ctx: DrawCtx,
  lines: string[],
  opts: { font?: PDFFont; size: number; color?: ReturnType<typeof rgb>; leading?: number },
) {
  const font = opts.font ?? ctx.font;
  const leading = opts.leading ?? opts.size * 1.45;
  const color = opts.color ?? TEXT;
  for (const line of lines) {
    ensureSpace(ctx, leading);
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y - opts.size,
      size: opts.size,
      font,
      color,
    });
    ctx.y -= leading;
  }
}

function drawParagraph(
  ctx: DrawCtx,
  text: string,
  opts: { font?: PDFFont; size: number; color?: ReturnType<typeof rgb>; gapAfter?: number } = {
    size: 11,
  },
) {
  const font = opts.font ?? ctx.font;
  const maxWidth = PAGE_W - MARGIN_X * 2;
  const lines = wrapText(text, font, opts.size, maxWidth);
  drawLines(ctx, lines, { font, size: opts.size, color: opts.color });
  if (opts.gapAfter) ctx.y -= opts.gapAfter;
}

function drawHeadingPrefixBody(ctx: DrawCtx, prefix: string | null, body: string) {
  const size = 11;
  const maxWidth = PAGE_W - MARGIN_X * 2;
  const paragraphs = splitParagraphs(body);
  const first = paragraphs[0] ?? "";
  const rest = paragraphs.slice(1);
  if (prefix?.trim() && first) {
    const label = `${toPdfSafe(prefix.trim())}: `;
    const labelWidth = ctx.bold.widthOfTextAtSize(label, size);
    const firstLines = wrapText(first, ctx.font, size, maxWidth - labelWidth);
    ensureSpace(ctx, size * 1.45);
    ctx.page.drawText(label, {
      x: MARGIN_X,
      y: ctx.y - size,
      size,
      font: ctx.bold,
      color: TEXT,
    });
    if (firstLines[0]) {
      ctx.page.drawText(firstLines[0], {
        x: MARGIN_X + labelWidth,
        y: ctx.y - size,
        size,
        font: ctx.font,
        color: TEXT,
      });
    }
    ctx.y -= size * 1.45;
    drawLines(ctx, firstLines.slice(1), { size });
  } else if (first) {
    drawParagraph(ctx, first, { size });
  }
  for (const para of rest) {
    ctx.y -= 6;
    drawParagraph(ctx, para, { size });
  }
  ctx.y -= 10;
}

function drawHeader(page: PDFPage, bold: PDFFont, font: PDFFont) {
  page.drawRectangle({
    x: PAGE_W - 268,
    y: PAGE_H - 28,
    width: 268,
    height: 28,
    color: NAVY,
  });
  page.drawText(toPdfSafe("Proposta de Prestação de Serviços Advocatícios"), {
    x: PAGE_W - 258,
    y: PAGE_H - 18,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("BISMARCHI | PIRES", {
    x: MARGIN_X,
    y: PAGE_H - 44,
    size: 16,
    font: bold,
    color: NAVY,
  });
  page.drawText("Sociedade de Advogados", {
    x: MARGIN_X,
    y: PAGE_H - 58,
    size: 8,
    font,
    color: MUTED,
  });
}

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number, total: number) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: 28,
    color: NAVY,
  });
  page.drawRectangle({
    x: 0,
    y: 28,
    width: PAGE_W,
    height: 3,
    color: GOLD,
  });
  page.drawText(
    toPdfSafe(
      "Rua Coronel Quirino, 1266 - Cambuí - Campinas-SP   (19) 3254-6446   bismarchipires.com.br",
    ),
    {
      x: MARGIN_X,
      y: 11,
      size: 7,
      font,
      color: rgb(1, 1, 1),
    },
  );
  page.drawText(`${pageNo} / ${total}`, {
    x: PAGE_W - MARGIN_X - 28,
    y: 11,
    size: 7,
    font,
    color: rgb(1, 1, 1),
  });
}

/** @deprecated Independent legacy layout; disconnected from production proposal routes. */
export async function renderPropostaPdf(pagePreview: PropostaDocumentPagePreview): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const first = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = {
    doc,
    page: first,
    font,
    bold,
    y: PAGE_H - 78,
  };

  drawHeader(first, bold, font);

  ctx.page.drawRectangle({
    x: MARGIN_X - 8,
    y: ctx.y - 18,
    width: 228,
    height: 22,
    color: GOLD,
  });
  ctx.page.drawText("1.  Objeto da Proposta", {
    x: MARGIN_X,
    y: ctx.y - 13,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  ctx.y -= 36;

  drawParagraph(ctx, pagePreview.clienteIntro, { size: 11, gapAfter: 14 });
  drawParagraph(ctx, "Descrição dos serviços:", { font: bold, size: 11, gapAfter: 8 });

  if (pagePreview.escopoSections.length > 0) {
    for (const group of groupEscopoSectionsByArea(pagePreview.escopoSections)) {
      drawParagraph(ctx, group.area.toLocaleUpperCase("pt-BR"), {
        font: bold,
        size: 11,
        color: NAVY,
        gapAfter: 4,
      });
      for (const section of group.items) {
        drawHeadingPrefixBody(ctx, section.scopeTypeLabel, section.text);
      }
    }
  } else if (pagePreview.escopo) {
    drawHeadingPrefixBody(ctx, null, pagePreview.escopo);
  }

  if (PROPOSTA_INCLUDE_SINTESE_DEMANDA && pagePreview.resumo) {
    drawParagraph(ctx, `Síntese da demanda: ${pagePreview.resumo}`, { size: 11, gapAfter: 10 });
  }

  if (pagePreview.investimento) {
    drawParagraph(ctx, PROPOSTA_INVESTIMENTO_HEADING.toLocaleUpperCase("pt-BR"), {
      font: bold,
      size: 11,
      color: NAVY,
      gapAfter: 4,
    });
    drawHeadingPrefixBody(ctx, null, pagePreview.investimento);
  }

  drawParagraph(ctx, `Data de vigência proposta: ${pagePreview.dataVigencia}`, {
    font: bold,
    size: 11,
    gapAfter: 18,
  });
  drawParagraph(ctx, "Cordialmente,", { size: 11, gapAfter: 22 });

  for (const signer of [
    { name: "Gustavo Bismarchi Motta", oab: "OAB/SP 275.477" },
    { name: "Ricardo Viscardi Pires", oab: "OAB/SP 353.389" },
  ]) {
    ensureSpace(ctx, 48);
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y },
      end: { x: MARGIN_X + 220, y: ctx.y },
      thickness: 0.6,
      color: TEXT,
    });
    ctx.y -= 14;
    drawParagraph(ctx, "Bismarchi | Pires - Sociedade de Advogados", { font: bold, size: 9 });
    drawParagraph(ctx, signer.name, { size: 10 });
    drawParagraph(ctx, signer.oab, { size: 10, gapAfter: 16 });
  }

  const pages = doc.getPages();
  pages.forEach((p, index) => {
    if (index > 0) drawHeader(p, bold, font);
    drawFooter(p, font, index + 1, pages.length);
  });

  return doc.save();
}
