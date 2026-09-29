/** Largura de referência A4 (pt PDF 595 → px de prévia alinhada ao docx-preview). */
export const PROPOSAL_PREVIEW_PAGE_WIDTH_PX = 794;

/** Altura de referência A4 alinhada aos WebPs do guia PDF. */
export const PROPOSAL_PREVIEW_PAGE_HEIGHT_PX = 1122;

/** Assets extraídos do guia `MODELO PDF DAS MINIATURAS E TIMBRADO.pdf` (7 páginas). */
export const PROPOSAL_PREVIEW_REFERENCE = {
  capa: "/proposal-preview/reference/capa.webp",
  institucional: "/proposal-preview/reference/institucional.webp",
  escopoA: "/proposal-preview/reference/escopo-a.webp",
  escopoB: "/proposal-preview/reference/escopo-b.webp",
  escopoC: "/proposal-preview/reference/escopo-c.webp",
  vigencia: "/proposal-preview/reference/vigencia.webp",
  cvGustavo: "/proposal-preview/reference/cv-gustavo.webp",
  cvRicardo: "/proposal-preview/reference/cv-ricardo.webp",
  assinatura: "/proposal-preview/reference/assinatura.webp",
  contracapa: "/proposal-preview/reference/contracapa.webp",
} as const;

export type ProposalPreviewStaticKind = keyof typeof PROPOSAL_PREVIEW_REFERENCE;

export const PROPOSAL_PREVIEW_STATIC_LABELS: Record<ProposalPreviewStaticKind, string> = {
  capa: "Capa",
  institucional: "Institucional",
  escopoA: "Timbrado escopo A",
  escopoB: "Timbrado escopo B",
  escopoC: "Timbrado escopo C",
  vigencia: "Vigência",
  cvGustavo: "CV Gustavo",
  cvRicardo: "CV Ricardo",
  assinatura: "Assinatura",
  contracapa: "Contracapa",
};

export const PROPOSAL_PREVIEW_OVERLAY_TEXT = {
  capaCliente: "#C4A86E",
  capaMeta: "#FFFFFF",
  body: "#1f1f1f",
} as const;

const CAPA_SERIF_FONT = "Georgia, 'Times New Roman', Times, serif";
const CAPA_SANS_FONT =
  'var(--font-plus-jakarta, "Plus Jakarta Sans"), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type ProposalPreviewOverlay = {
  text: string;
  leftPct: number;
  topPct: number;
  fontSizePx: number;
  fontWeight?: number;
  maxWidthPct?: number;
  lineHeight?: number;
  color?: string;
  fontFamily?: string;
  letterSpacing?: string;
  textTransform?: "uppercase" | "none";
  textAlign?: "left" | "center" | "right";
  /** Reservado — não aplica caixa branca; texto fica sobre a miniatura. */
  mask?: boolean;
};

/** Índices das folhas finais do modelo BP (após escopo/investimento). */
export type ProposalPreviewTailLayout = {
  cvGustavo: number;
  cvRicardo: number;
  assinatura: number;
  contracapa: number;
};

export type ProposalCapaFields = {
  cliente: string;
  dataLinha: string;
  enviadoPor: string;
};

const CAPA_IGNORE_LINE =
  /^(PROPOSTA(?:\s+DE)?|SERVIÇOS JURÍDICOS|@bismarchipires|Rua Coronel Quirino|3254-6446|3234-6446|bismarchipires\.com)/i;

const CAPA_CONTACT_NOISE =
  /\(19\)|www\.bismarchipires|contato@bismarchipires|\|\s*www\.|Cambuí|Coronel Quirino/i;

/** Traços/linhas decorativas do Word que não devem virar overlay na capa. */
export function isCapaDecorativeLine(line: string): boolean {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  if (/^[\-–—•|_\s.]+$/.test(trimmed)) return true;
  if (/^(-\s*){2,}$/.test(trimmed)) return true;
  return false;
}

function isCapaNoiseLine(line: string) {
  if (CAPA_IGNORE_LINE.test(line)) return true;
  if (CAPA_CONTACT_NOISE.test(line)) return true;
  if (isCapaDecorativeLine(line)) return true;
  if (/\bPROPOSTA\b/i.test(line) && /\bSERVIÇOS\b/i.test(line)) return true;
  if (/^Enviado por:/i.test(line)) return true;
  if (/^Campinas\/SP,/i.test(line)) return true;
  return false;
}

/** Campos mutáveis da capa a partir do `templateData` canônico (sem parse do DOCX). */
export function capaFieldsFromPreviewPage(capa: {
  empresa: string;
  responsavel: string;
  dataProposta: string;
}): ProposalCapaFields {
  const cliente = normalizeCapaClienteLine(capa.empresa.trim()) || "Cliente";
  const enviadoPor = capa.responsavel.trim();
  const data = capa.dataProposta.trim();
  const dataLinha = data ? `Campinas/SP, ${data}` : "Campinas/SP";
  return { cliente, dataLinha, enviadoPor };
}

/** Remove título fixo colado ao nome (artefato de runs/parágrafos do Word). */
export function normalizeCapaClienteLine(line: string): string {
  return line
    .replace(/\s*PROPOSTA\s+DE\s+SERVI[CÇ]OS\s+JUR[IÍ]DICOS.*$/i, "")
    .replace(/\s*PROPOSTA\s+DE\s*$/i, "")
    .replace(/\s*SERVI[CÇ]OS\s+JUR[IÍ]DICOS.*$/i, "")
    .replace(/LT-\s*DA\b/gi, "LTDA")
    .replace(/\s+/g, " ")
    .trim();
}

export function getWordPagePlainText(page: HTMLElement) {
  return Array.from(page.querySelectorAll("article"))
    .map((article) => article.textContent ?? "")
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

/** @deprecated Prefer `resolveProposalPreviewTailLayout`; mantido para testes legados. */
export function findProposalVigenciaPageIndex(pages: HTMLElement[]): number {
  const tail = resolveProposalPreviewTailLayout(pages);
  return tail?.assinatura ?? -1;
}

export function isAssinaturaSociosPage(text: string) {
  return /Gustavo Bismarchi/i.test(text) && /Ricardo Viscardi/i.test(text);
}

/** Folha de assinaturas + caixa de vigência (guia PDF p.6). */
export function resolveProposalPreviewTailLayout(
  pages: HTMLElement[],
): ProposalPreviewTailLayout | null {
  const assinatura = pages.findIndex((page) =>
    isAssinaturaSociosPage(getWordPagePlainText(page)),
  );
  if (assinatura < 2) return null;
  return {
    cvGustavo: assinatura - 2,
    cvRicardo: assinatura - 1,
    assinatura,
    contracapa: pages.length - 1,
  };
}

function isLikelyCvRicardoSlotPage(page: HTMLElement) {
  const text = getWordPagePlainText(page);
  if (!text) return true;
  if (isAssinaturaSociosPage(text)) return false;
  if (/Data de vig[eê]ncia proposta:/i.test(text)) return false;
  if (/Gustavo Bismarchi/i.test(text) && /Formação|Graduado/i.test(text)) return false;
  if (/Ricardo Viscardi/i.test(text)) return true;
  return text.length < 120;
}

export function findProposalVigenciaDateInPages(pages: HTMLElement[]): string | null {
  for (const page of pages) {
    const value = extractFechamentoVigencia(page);
    if (value) return value;
  }
  return null;
}

/** Páginas fixas do modelo (não escopo) mapeadas às miniaturas do guia PDF. */
export function classifyProposalPreviewStaticPage(
  page: HTMLElement,
  index: number,
  pages: HTMLElement[],
): ProposalPreviewStaticKind | null {
  const text = getWordPagePlainText(page);

  if (index === 0) return "capa";

  if (/QUEM SOMOS|NOSSO ESCRITÓRIO|SOBRE NÓS/i.test(text)) return "institucional";

  const tail = resolveProposalPreviewTailLayout(pages);
  if (tail) {
    if (index === tail.cvGustavo) return "cvGustavo";
    if (index === tail.cvRicardo && isLikelyCvRicardoSlotPage(page)) return "cvRicardo";
    if (index === tail.assinatura) return "assinatura";
    if (index === tail.contracapa && index > tail.assinatura) return "contracapa";
  }

  if (
    index > 0 &&
    index === pages.length - 1 &&
    text.length < 80 &&
    !/INVESTIMENTO|HONORÁRIOS/i.test(text)
  ) {
    return "contracapa";
  }

  return null;
}

export function extractCapaFields(page: HTMLElement): ProposalCapaFields {
  const paragraphs = Array.from(page.querySelectorAll<HTMLElement>("p"))
    .map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let dataLinha = "";
  let enviadoPor = "";
  let cliente = "";
  let pastHeader = false;
  const clienteCandidates: string[] = [];

  for (const line of paragraphs) {
    if (/^Campinas\/SP,/i.test(line)) {
      dataLinha = line;
      continue;
    }
    if (/^Enviado por:/i.test(line)) {
      enviadoPor = line.replace(/^Enviado por:\s*/i, "").trim();
      continue;
    }
    if (CAPA_IGNORE_LINE.test(line)) {
      if (/^SERVIÇOS JURÍDICOS$/i.test(line)) pastHeader = true;
      continue;
    }
    if (isCapaNoiseLine(line)) continue;

    const cleaned = normalizeCapaClienteLine(line);
    if (cleaned.length < 2 || isCapaDecorativeLine(cleaned) || /^PROPOSTA/i.test(cleaned)) {
      continue;
    }

    if (pastHeader && !cliente) {
      cliente = cleaned;
      continue;
    }

    if (!pastHeader) {
      clienteCandidates.push(cleaned);
    }
  }

  if (!cliente) {
    cliente =
      clienteCandidates.sort((a, b) => b.length - a.length)[0] ??
      paragraphs
        .map(normalizeCapaClienteLine)
        .find(
          (line) =>
            line.length >= 2 &&
            !isCapaNoiseLine(line) &&
            !isCapaDecorativeLine(line) &&
            !/^PROPOSTA/i.test(line),
        ) ??
      "Cliente";
  }

  if (!dataLinha) {
    const match = getWordPagePlainText(page).match(/Campinas\/SP,\s*[^\n]+/i);
    dataLinha = match?.[0]?.trim() ?? "Campinas/SP";
  }
  if (!enviadoPor) {
    const match = getWordPagePlainText(page).match(/Enviado por:\s*([^\n]+)/i);
    enviadoPor = match?.[1]?.trim() ?? "";
  }

  return { cliente, dataLinha, enviadoPor };
}

export function capaOverlays(fields: ProposalCapaFields): ProposalPreviewOverlay[] {
  const overlays: ProposalPreviewOverlay[] = [
    {
      text: fields.cliente,
      leftPct: 14.07,
      topPct: 48.02,
      fontSizePx: 36,
      fontWeight: 400,
      maxWidthPct: 82,
      lineHeight: 1.05,
      color: PROPOSAL_PREVIEW_OVERLAY_TEXT.capaCliente,
      fontFamily: CAPA_SERIF_FONT,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    },
    {
      text: fields.enviadoPor ? `Enviado por: ${fields.enviadoPor}` : "",
      leftPct: 14.07,
      topPct: 76.01,
      fontSizePx: 12,
      fontWeight: 400,
      maxWidthPct: 75,
      color: PROPOSAL_PREVIEW_OVERLAY_TEXT.capaMeta,
      fontFamily: CAPA_SANS_FONT,
    },
    {
      text: fields.dataLinha,
      leftPct: 14.23,
      topPct: 79.15,
      fontSizePx: 12,
      fontWeight: 400,
      color: PROPOSAL_PREVIEW_OVERLAY_TEXT.capaMeta,
      fontFamily: CAPA_SANS_FONT,
    },
  ];
  return overlays.filter((item) => {
    const trimmed = item.text.replace(/\s+/g, " ").trim();
    return trimmed.length > 0 && !isCapaDecorativeLine(trimmed);
  });
}

export function extractFechamentoVigencia(page: HTMLElement): string | null {
  const text = getWordPagePlainText(page);
  const match = text.match(
    /Data de vig[eê]ncia proposta:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})|Vig[eê]ncia(?:\s+da\s+Proposta)?:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i,
  );
  return match?.[1] ?? match?.[2] ?? null;
}

/** Folha de assinaturas do `proposta-modelo.pdf` (pt, origem no topo). */
const ASSINATURA_PAGE_PT = { width: 595.2, height: 841.92 };
const ASSINATURA_VIGENCIA_BOX_PT = { left: 199.4, top: 210.22, right: 394.25, bottom: 244.77 };
/** Mesmo `VIGENCIA` de `proposta-pdf-builder.ts` (Inter 12 pt, reduzida para caber em 176 pt). */
const ASSINATURA_VIGENCIA_TEXT_PT = { x: 210.8, baseline: 221.52, size: 12, maxWidth: 176 };
/** Métricas do Inter: avanço médio da linha "Vigência da Proposta: dd/mm/aaaa" e baseline com line-height 1. */
const INTER_AVG_ADVANCE_EM = 0.5039;
const INTER_BASELINE_EM = 0.8638;
const VIGENCIA_FONT = 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const pxPerPt = PROPOSAL_PREVIEW_PAGE_WIDTH_PX / ASSINATURA_PAGE_PT.width;
const xPct = (pt: number) => (pt / ASSINATURA_PAGE_PT.width) * 100;
const yPct = (pt: number) => (pt / ASSINATURA_PAGE_PT.height) * 100;

/** Caixa dourada da vigência na miniatura de assinaturas, em % da folha. */
export const PROPOSAL_PREVIEW_VIGENCIA_BOX_PCT = {
  left: xPct(ASSINATURA_VIGENCIA_BOX_PT.left),
  top: yPct(ASSINATURA_VIGENCIA_BOX_PT.top),
  right: xPct(ASSINATURA_VIGENCIA_BOX_PT.right),
  bottom: yPct(ASSINATURA_VIGENCIA_BOX_PT.bottom),
};

/** Overlay da caixa de vigência na folha de assinaturas (guia PDF p.6). */
export function fechamentoOverlays(vigencia: string | null): ProposalPreviewOverlay[] {
  const value = vigencia?.replace(/\s+/g, " ").trim();
  if (!value) return [];
  const text = `Vigência da Proposta: ${value}`;
  const { x, baseline, size, maxWidth } = ASSINATURA_VIGENCIA_TEXT_PT;
  const sizePt = Math.min(size, maxWidth / (INTER_AVG_ADVANCE_EM * text.length));
  const fontSizePx = Number((sizePt * pxPerPt).toFixed(2));
  const topPx = baseline * (PROPOSAL_PREVIEW_PAGE_HEIGHT_PX / ASSINATURA_PAGE_PT.height) - INTER_BASELINE_EM * fontSizePx;
  return [
    {
      text,
      leftPct: Number(xPct(x).toFixed(2)),
      topPct: Number(((topPx / PROPOSAL_PREVIEW_PAGE_HEIGHT_PX) * 100).toFixed(2)),
      fontSizePx,
      fontWeight: 400,
      lineHeight: 1,
      maxWidthPct: Number(xPct(ASSINATURA_VIGENCIA_BOX_PT.right - x).toFixed(2)),
      textAlign: "left",
      color: "#000000",
      fontFamily: VIGENCIA_FONT,
    },
  ];
}

export type ResolveProposalPreviewStaticThumbnailOptions = {
  capaFieldsOverride?: ProposalCapaFields | null;
  /** `DATA_VIGENCIA` do `templateData` canônico; o texto do DOCX é só fallback. */
  vigenciaOverride?: string | null;
  pages?: HTMLElement[];
};

export function resolveProposalPreviewStaticThumbnail(
  kind: ProposalPreviewStaticKind,
  page: HTMLElement,
  options?: ProposalCapaFields | null | ResolveProposalPreviewStaticThumbnailOptions,
): { label: string; asset: string; overlays: ProposalPreviewOverlay[] } {
  const normalized: ResolveProposalPreviewStaticThumbnailOptions =
    options && "cliente" in options
      ? { capaFieldsOverride: options }
      : (options ?? {});
  const label = PROPOSAL_PREVIEW_STATIC_LABELS[kind];
  const asset = PROPOSAL_PREVIEW_REFERENCE[kind];
  if (kind === "capa") {
    const fields = normalized.capaFieldsOverride ?? extractCapaFields(page);
    return { label, asset, overlays: capaOverlays(fields) };
  }
  if (kind === "assinatura" || kind === "vigencia") {
    const vigencia =
      normalized.vigenciaOverride?.trim() ||
      extractFechamentoVigencia(page) ||
      (normalized.pages ? findProposalVigenciaDateInPages(normalized.pages) : null);
    return { label, asset: PROPOSAL_PREVIEW_REFERENCE.assinatura, overlays: fechamentoOverlays(vigencia) };
  }
  return { label, asset, overlays: [] };
}

/** Timbrado de conteúdo (escopo interativo): 1ª folha escopo-a, depois b/c. */
export function resolveScopeLetterheadAsset(scopePageIndex: number): string {
  if (scopePageIndex <= 0) return PROPOSAL_PREVIEW_REFERENCE.escopoA;
  if (scopePageIndex === 1) return PROPOSAL_PREVIEW_REFERENCE.escopoB;
  return PROPOSAL_PREVIEW_REFERENCE.escopoC;
}

export function getProposalPreviewLetterheadStyle(
  assetSrc: string,
  pageWidth = PROPOSAL_PREVIEW_PAGE_WIDTH_PX,
): Record<string, string> {
  const pageHeight = Math.round((pageWidth * PROPOSAL_PREVIEW_PAGE_HEIGHT_PX) / PROPOSAL_PREVIEW_PAGE_WIDTH_PX);
  return {
    backgroundColor: "transparent",
    backgroundImage: `url(${assetSrc})`,
    backgroundSize: `${pageWidth}px ${pageHeight}px`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "top center",
    minHeight: `${pageHeight}px`,
  };
}

export function applyProposalPreviewOverlayStyles(
  node: HTMLElement,
  overlay: ProposalPreviewOverlay,
) {
  node.style.position = "absolute";
  node.style.zIndex = "10";
  node.style.left = `${overlay.leftPct}%`;
  node.style.top = `${overlay.topPct}%`;
  node.style.fontSize = `${overlay.fontSizePx}px`;
  node.style.fontWeight = String(overlay.fontWeight ?? 400);
  node.style.lineHeight = String(overlay.lineHeight ?? 1.2);
  node.style.color = overlay.color ?? PROPOSAL_PREVIEW_OVERLAY_TEXT.body;
  node.style.background = "transparent";
  if (overlay.fontFamily) node.style.fontFamily = overlay.fontFamily;
  if (overlay.letterSpacing) node.style.letterSpacing = overlay.letterSpacing;
  if (overlay.textTransform) node.style.textTransform = overlay.textTransform;
  if (overlay.maxWidthPct) node.style.maxWidth = `${overlay.maxWidthPct}%`;
  if (overlay.textAlign) node.style.textAlign = overlay.textAlign;
}

/** Oculta texto fixo/decorativo do Word na capa antes da miniatura de referência. */
export function hideCapaDocxTextArtifacts(page: HTMLElement) {
  for (const paragraph of page.querySelectorAll<HTMLElement>("p")) {
    const normalized = (paragraph.textContent ?? "").replace(/\s+/g, " ").trim();
    if (
      isCapaDecorativeLine(normalized) ||
      CAPA_IGNORE_LINE.test(normalized) ||
      CAPA_CONTACT_NOISE.test(normalized) ||
      (/\bPROPOSTA\b/i.test(normalized) && /\bSERVIÇOS\b/i.test(normalized))
    ) {
      paragraph.style.display = "none";
    }
  }

  for (const box of page.querySelectorAll("foreignObject")) {
    const normalized = (box.textContent ?? "").replace(/\s+/g, " ").trim();
    if (
      !normalized ||
      isCapaDecorativeLine(normalized) ||
      CAPA_IGNORE_LINE.test(normalized) ||
      CAPA_CONTACT_NOISE.test(normalized) ||
      (/\bPROPOSTA\b/i.test(normalized) && /\bSERVIÇOS\b/i.test(normalized))
    ) {
      const svg = box.closest("svg");
      if (svg instanceof SVGElement) {
        svg.style.visibility = "hidden";
        svg.setAttribute("aria-hidden", "true");
      }
    }
  }
}
