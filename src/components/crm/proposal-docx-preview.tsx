"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Minus, MoveHorizontal, Plus, Scan } from "lucide-react";
import { cn } from "@/lib/utils";

type ProposalDocxPreviewProps = {
  blob: Blob;
};

function getWordPageBody(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLElement>(":scope > article"));
}

function getWordPageBodyText(page: HTMLElement) {
  return getWordPageBody(page)
    .map((article) => article.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankWordPage(page: HTMLElement) {
  const articles = getWordPageBody(page);
  const hasVisualContent = articles.some((article) =>
    article.querySelector("img, svg, canvas, table"),
  );

  return getWordPageBodyText(page).length === 0 && !hasVisualContent;
}

function replaceWordPageWithPlaceholder(
  page: HTMLElement,
  label: string,
  description: string,
) {
  const placeholder = document.createElement("div");
  placeholder.className =
    "flex min-h-36 w-full flex-col items-center justify-center rounded-(--radius-v2-xl) border border-dashed border-neutral-300 bg-white/90 px-8 py-8 text-center shadow-(--shadow-v2-sm)";

  const badge = document.createElement("strong");
  badge.className =
    "rounded-(--radius-v2-full) bg-interactive-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-interactive-700";
  badge.textContent = label;

  const title = document.createElement("span");
  title.className = "mt-3 text-sm font-semibold text-foreground";
  title.textContent = "Disponível no arquivo Word";

  const message = document.createElement("span");
  message.className = "mt-1 max-w-md text-xs leading-relaxed text-muted-foreground";
  message.textContent = description;

  placeholder.append(badge, title, message);
  page.replaceChildren(placeholder);
  page.dataset.previewPlaceholder = "true";
  page.setAttribute("aria-label", `${label}: disponível no arquivo Word`);
  page.style.minHeight = "0";
  page.style.height = "auto";
  page.style.padding = "0";
  page.style.border = "0";
  page.style.background = "transparent";
  page.style.boxShadow = "none";
  page.style.overflow = "visible";
}

function compactUnsupportedWordPages(pages: HTMLElement[]) {
  const blankPages = pages.map(isBlankWordPage);
  const firstPageText = pages[0] ? getWordPageBodyText(pages[0]) : "";
  const hasCover = /\bPROPOSTA(?:\s+DE)?\b/i.test(firstPageText);

  if (hasCover && pages[0]) {
    replaceWordPageWithPlaceholder(
      pages[0],
      "Capa",
      "A capa foi ocultada apenas nesta visualização para evitar quebras do navegador. Ela permanece completa no Word baixado.",
    );
  }

  pages.forEach((page, index) => {
    if (!blankPages[index]) return;

    // Algumas capas com elementos absolutos geram uma segunda folha vazia
    // apenas no docx-preview. Ela não precisa ocupar espaço no navegador.
    if (hasCover && index === 1) {
      page.remove();
      return;
    }

    replaceWordPageWithPlaceholder(
      page,
      `Página ${index + 1}`,
      "Esta página não pôde ser representada com fidelidade no navegador. O conteúdo permanece no Word baixado.",
    );
  });
}

function fitOverflowingWordTextBoxes(root: HTMLElement) {
  const boxes = root.querySelectorAll("foreignObject");

  for (const box of boxes) {
    const content = box.firstElementChild;
    if (!(content instanceof HTMLElement)) continue;

    const boxHeight = box.clientHeight || box.getBoundingClientRect().height;
    const contentHeight = content.scrollHeight || content.getBoundingClientRect().height;
    if (boxHeight <= 0 || contentHeight <= boxHeight + 2) continue;

    const textElements = Array.from(
      content.querySelectorAll<HTMLElement>('[style*="font-size"]'),
    );
    if (textElements.length === 0) continue;

    const originalSizes = textElements.map((element) => ({
      element,
      size: Number.parseFloat(window.getComputedStyle(element).fontSize),
    }));
    const largestFontSize = Math.max(...originalSizes.map((item) => item.size));
    const svg = box.closest("svg");

    // O Word usa caixas absolutas com autofit na capa. O docx-preview mantém a
    // altura fixa do SVG e corta títulos grandes; nesses casos há espaço livre
    // na página e é mais fiel ampliar a caixa do que reduzir o título.
    if (svg instanceof SVGElement && largestFontSize >= 28) {
      const expandedHeight = Math.ceil(contentHeight + 2);
      svg.style.height = `${expandedHeight}px`;
      svg.setAttribute("height", String(expandedHeight));
      box.setAttribute("data-preview-autofit", "expand");
      continue;
    }

    box.setAttribute("data-preview-autofit", "shrink");
    let factor = Math.max(0.3, Math.min(0.98, (boxHeight / contentHeight) * 0.96));

    const applyFactor = () => {
      for (const item of originalSizes) {
        if (!Number.isFinite(item.size)) continue;
        item.element.style.fontSize = `${item.size * factor}px`;
      }
    };

    applyFactor();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (
        (content.scrollHeight || content.getBoundingClientRect().height) <=
        boxHeight + 1
      ) {
        break;
      }
      factor = Math.max(0.25, factor * 0.9);
      applyFactor();
    }
  }
}

export function ProposalDocxPreview({ blob }: ProposalDocxPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<"page" | "width">("page");
  const [pageCount, setPageCount] = useState(0);

  const scale = manualScale ?? fitScale;

  useEffect(() => {
    const generation = ++generationRef.current;
    const documentContainer = documentRef.current;
    if (!documentContainer) return;

    setRendering(true);
    setError(null);

    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        const staging = document.createElement("div");
        await renderAsync(blob, staging, staging, {
          breakPages: true,
          className: "proposal-docx",
          experimental: false,
          ignoreFonts: false,
          ignoreHeight: false,
          ignoreLastRenderedPageBreak: false,
          ignoreWidth: false,
          inWrapper: true,
          renderChanges: false,
          renderComments: false,
          renderEndnotes: true,
          renderFooters: true,
          renderFootnotes: true,
          renderHeaders: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
        });

        if (generation !== generationRef.current) return;

        const wrapper = staging.querySelector<HTMLElement>(".proposal-docx-wrapper");
        if (wrapper) {
          wrapper.style.background = "transparent";
          wrapper.style.padding = "0";
          wrapper.style.paddingBottom = "0";
          wrapper.style.gap = "20px";
        }
        const pages = Array.from(
          staging.querySelectorAll<HTMLElement>(
            ".proposal-docx-wrapper > section.proposal-docx",
          ),
        );
        for (const page of pages) {
          page.style.marginBottom = "0";
          page.style.border = "1px solid rgba(16, 31, 46, 0.10)";
          page.style.borderRadius = "2px";
          page.style.boxShadow =
            "0 2px 4px rgba(16, 31, 46, 0.08), 0 18px 42px rgba(16, 31, 46, 0.12)";
        }
        compactUnsupportedWordPages(pages);

        documentContainer.replaceChildren(...Array.from(staging.childNodes));
        setPageCount(
          documentContainer.querySelectorAll(
            ".proposal-docx-wrapper > section.proposal-docx",
          ).length,
        );
        setRendering(false);
      } catch {
        if (generation !== generationRef.current) return;
        documentContainer.replaceChildren();
        setPageCount(0);
        setRendering(false);
        setError("Não foi possível renderizar a prévia do Word neste navegador.");
      }
    })();

    return () => {
      generationRef.current += 1;
    };
  }, [blob]);

  useEffect(() => {
    if (rendering || error) return;
    const documentContainer = documentRef.current;
    if (!documentContainer) return;
    let cancelled = false;

    const fit = () => {
      if (!cancelled) fitOverflowingWordTextBoxes(documentContainer);
    };

    void document.fonts.ready.then(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
    });
    const timer = window.setTimeout(fit, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [blob, error, rendering]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const documentContainer = documentRef.current;
    if (!viewport || !documentContainer) return;

    const updateFitScale = () => {
      const page = documentContainer.querySelector<HTMLElement>(
        ".proposal-docx-wrapper > section.proposal-docx:not([data-preview-placeholder])",
      );
      if (!page) return;
      const style = window.getComputedStyle(viewport);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const availableWidth = Math.max(240, viewport.clientWidth - horizontalPadding);
      const availableHeight = Math.max(240, viewport.clientHeight - verticalPadding);
      const naturalPageWidth = page.offsetWidth;
      const naturalPageHeight = page.offsetHeight;
      if (naturalPageWidth <= 0 || naturalPageHeight <= 0) return;
      const widthScale = availableWidth / naturalPageWidth;
      const heightScale = availableHeight / naturalPageHeight;
      const nextScale =
        fitMode === "page" ? Math.min(widthScale, heightScale) : widthScale;
      setFitScale(Math.min(1, Math.max(0.35, nextScale)));
    };

    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(viewport);
    observer.observe(documentContainer);
    return () => observer.disconnect();
  }, [blob, fitMode, rendering]);

  useEffect(() => {
    const wrapper = documentRef.current?.querySelector<HTMLElement>(
      ".proposal-docx-wrapper",
    );
    if (!wrapper) return;
    wrapper.style.setProperty("zoom", String(scale));
  }, [scale, rendering]);

  function changeScale(delta: number) {
    setManualScale(Math.min(1.5, Math.max(0.35, scale + delta)));
  }

  function applyFitMode(mode: "page" | "width") {
    setFitMode(mode);
    setManualScale(null);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-200/70">
      <div
        ref={viewportRef}
        className="crm-scrollbar min-h-0 flex-1 overflow-auto px-4 py-5 shadow-inner shadow-primary-dark/5 sm:px-6 sm:py-7"
      >
        <div
          ref={documentRef}
          className="mx-auto min-h-full w-max max-w-none"
        />
      </div>

      {rendering ? (
        <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-(--radius-v2-full) border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-(--shadow-v2-sm)">
          <Loader2 className="size-3.5 animate-spin text-interactive-700" aria-hidden />
          Renderizando o Word…
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 p-6 text-center text-muted-foreground">
          <FileText className="size-9" aria-hidden />
          <p className="max-w-md text-sm">{error}</p>
        </div>
      ) : null}

      {!rendering && !error ? (
        <div className="shrink-0 border-t border-border bg-white/95 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex w-fit items-center gap-1 rounded-(--radius-v2-full) border border-border bg-white p-1 shadow-(--shadow-v2-sm)">
            <button
              type="button"
              onClick={() => changeScale(-0.1)}
              disabled={scale <= 0.35}
              aria-label="Diminuir zoom da prévia"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground disabled:opacity-40"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="min-w-11 text-center text-[11px] font-semibold tabular-nums text-foreground">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => changeScale(0.1)}
              disabled={scale >= 1.5}
              aria-label="Aumentar zoom da prévia"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <button
              type="button"
              onClick={() => applyFitMode("page")}
              aria-label="Mostrar a página inteira"
              aria-pressed={manualScale == null && fitMode === "page"}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                manualScale == null && fitMode === "page"
                  ? "bg-interactive-50 text-interactive-700"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
              )}
            >
              <Scan className="size-3.5" aria-hidden />
              Página
            </button>
            <button
              type="button"
              onClick={() => applyFitMode("width")}
              aria-label="Ajustar página à largura disponível"
              aria-pressed={manualScale == null && fitMode === "width"}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                manualScale == null && fitMode === "width"
                  ? "bg-interactive-50 text-interactive-700"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
              )}
            >
              <MoveHorizontal className="size-3.5" aria-hidden />
              Largura
            </button>
            {pageCount > 0 ? (
              <>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <span className="pr-2 text-[11px] font-medium text-muted-foreground">
                    {pageCount} {pageCount === 1 ? "página exibida" : "páginas exibidas"}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
