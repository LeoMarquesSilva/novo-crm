"use client";

import type React from "react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePaginatedBlocks, type PreviewBlock } from "@/lib/crm/document-pagination";
import type { PropostaPreviewPage } from "@/lib/crm/proposta-docx-data";

/**
 * Prévia HTML da proposta — mesmo princípio da prévia do contrato
 * (`ContratoBodyPages`): nenhuma conversão DOCX→PDF. Diferente do contrato,
 * a proposta é um documento institucional com arte fixa (capa, "Quem Somos",
 * sócios, fechamento) que não é texto corrido — essas páginas viram uma
 * imagem PNG de página inteira (extraída uma vez do Word aprovado, ver
 * `public/proposta-assets/`), com só o texto realmente dinâmico (empresa,
 * responsável, datas) sobreposto por cima. Só Escopo/Investimento — texto
 * corrido de verdade — usa o motor de paginação por medição real
 * (`usePaginatedBlocks`, compartilhado com o contrato).
 *
 * Enquanto os PNGs reais (`capa.png`, `quem-somos.png`, `socios.png`,
 * `fechamento.png`) não existem em `public/proposta-assets/`, cada página
 * mostra um retângulo cinza com o nome — a página não fica quebrada, só sem
 * a arte final.
 */

export const PROPOSTA_A4_WIDTH = 794;
export const PROPOSTA_A4_HEIGHT = 1123;

const A4_PAGE_CLASS =
  "relative mx-auto w-full max-w-[794px] overflow-hidden bg-white shadow-[0_24px_70px_rgba(16,31,46,0.22)] ring-1 ring-black/5";

/** Times New Roman 12pt justificado — tipografia documentada do modelo Word
 * oficial pros blocos de Escopo/Investimento (estilos `BPScopeBody`/
 * `BPInvestmentBody`), diferente dos 11pt usados no corpo do contrato. */
const ESCOPO_BODY_STYLE: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: "12pt",
  lineHeight: "1.6",
  color: "#111111",
  textAlign: "justify",
};

const PAGE_TOP_SAFE_ZONE = 96;
const PAGE_BOTTOM_SAFE_ZONE = 96;
const PAGE_CONTENT_HEIGHT = PROPOSTA_A4_HEIGHT - PAGE_TOP_SAFE_ZONE - PAGE_BOTTOM_SAFE_ZONE;

/** Texto dinâmico sobreposto numa página de arte fixa (coordenadas em px,
 * relativas ao canto superior esquerdo da página 794×1123). As coordenadas
 * abaixo são uma primeira aproximação — calibração fina pendente de revisão
 * visual contra o PDF de referência (ver plano). */
type OverlayField = {
  top: number;
  left: number;
  width: number;
  fontSize?: number;
  align?: "left" | "center" | "right";
  text: string;
};

function PropostaStaticPage({
  imageSrc,
  overlayFields = [],
  placeholderLabel,
}: {
  imageSrc: string;
  overlayFields?: OverlayField[];
  placeholderLabel: string;
}) {
  return (
    <div className={A4_PAGE_CLASS} style={{ minHeight: PROPOSTA_A4_HEIGHT }}>
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400"
        style={{
          backgroundImage: `url(${imageSrc})`,
          backgroundSize: `${PROPOSTA_A4_WIDTH}px ${PROPOSTA_A4_HEIGHT}px`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top center",
        }}
      >
        {placeholderLabel}
      </div>
      {overlayFields.map((field, i) => (
        <p
          key={i}
          className="absolute m-0"
          style={{
            top: field.top,
            left: field.left,
            width: field.width,
            fontSize: field.fontSize ?? 11,
            textAlign: field.align ?? "left",
            fontFamily: "'Times New Roman', Times, serif",
            color: "#111111",
          }}
        >
          {field.text}
        </p>
      ))}
    </div>
  );
}

function PropostaCapaPage({ capa }: { capa: PropostaPreviewPage["capa"] }) {
  const overlayFields: OverlayField[] = [
    { top: 420, left: 64, width: 666, fontSize: 20, align: "center", text: capa.empresa || "—" },
    { top: 900, left: 64, width: 666, fontSize: 12, align: "center", text: capa.responsavel || "—" },
    { top: 930, left: 64, width: 666, fontSize: 11, align: "center", text: capa.dataProposta || "—" },
  ];
  return <PropostaStaticPage imageSrc="/proposta-assets/capa.png" overlayFields={overlayFields} placeholderLabel="Capa" />;
}

function PropostaQuemSomosPage() {
  return <PropostaStaticPage imageSrc="/proposta-assets/quem-somos.png" placeholderLabel="Quem Somos" />;
}

function PropostaSociosPage() {
  return <PropostaStaticPage imageSrc="/proposta-assets/socios.png" placeholderLabel="Sócios" />;
}

function PropostaFechamentoPage({ fechamento }: { fechamento: PropostaPreviewPage["fechamento"] }) {
  const overlayFields: OverlayField[] = [
    { top: 260, left: 64, width: 300, fontSize: 11, text: fechamento.dataVigencia || "—" },
  ];
  return (
    <PropostaStaticPage imageSrc="/proposta-assets/fechamento.png" overlayFields={overlayFields} placeholderLabel="Fechamento" />
  );
}

function buildEscopoInvestimentoBlocks(data: PropostaPreviewPage["escopoInvestimento"]): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  data.areas.forEach((area, i) => {
    blocks.push({
      key: `escopo-area-${i}`,
      forceBreakBefore: i === 0,
      node: (
        <div className="mb-4">
          <p className="mb-1 font-bold" style={{ fontSize: "14pt" }}>
            {area.areaLabel}
          </p>
          {area.scopeTypeLabel ? <p className="mb-1 font-bold">{area.scopeTypeLabel}</p> : null}
          <p style={{ whiteSpace: "pre-wrap" }}>{area.text}</p>
        </div>
      ),
    });
  });
  if (data.investimentoText) {
    blocks.push({
      key: "investimento",
      forceBreakBefore: data.areas.length === 0,
      node: (
        <p className="mb-4" style={{ whiteSpace: "pre-wrap" }}>
          {data.investimentoText}
        </p>
      ),
    });
  }
  return blocks;
}

/** Pager da proposta: Capa e Quem Somos são sempre as duas primeiras páginas
 * (arte fixa); Escopo/Investimento flui por quantas páginas o conteúdo real
 * precisar (medição real, igual ao contrato); Sócios e Fechamento vêm sempre
 * depois, em páginas próprias — onde quer que a paginação dinâmica termine. */
export function PropostaBodyPages({ page }: { page: PropostaPreviewPage }) {
  const blocks = useMemo(() => buildEscopoInvestimentoBlocks(page.escopoInvestimento), [page.escopoInvestimento]);
  const { pages, measureHostRef } = usePaginatedBlocks(blocks, PAGE_CONTENT_HEIGHT);
  const hasEscopoContent = blocks.length > 0;

  return (
    <div className="space-y-4">
      <PropostaCapaPage capa={page.capa} />
      <PropostaQuemSomosPage />

      {hasEscopoContent ? (
        <>
          {/* Medição escondida: mesma largura/padding da página real, pra cada
              bloco quebrar linha igualzinho ao que vai aparecer de verdade. */}
          <div
            aria-hidden
            style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", top: 0, left: -99999, width: PROPOSTA_A4_WIDTH }}
          >
            <div
              ref={measureHostRef}
              className={cn(A4_PAGE_CLASS, "px-[11%]")}
              style={{ ...ESCOPO_BODY_STYLE, paddingTop: PAGE_TOP_SAFE_ZONE, paddingBottom: PAGE_BOTTOM_SAFE_ZONE }}
            >
              {blocks.map((b) => (
                <div key={b.key}>{b.node}</div>
              ))}
              <div key="__end-sentinel__" />
            </div>
          </div>

          {pages.map((pageBlocks, i) => (
            <div key={i}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Folha {i + 3} — Escopo e investimento
              </p>
              <div
                className={cn(A4_PAGE_CLASS, "px-[11%]")}
                style={{
                  ...ESCOPO_BODY_STYLE,
                  paddingTop: PAGE_TOP_SAFE_ZONE,
                  paddingBottom: PAGE_BOTTOM_SAFE_ZONE,
                  minHeight: PROPOSTA_A4_HEIGHT,
                }}
              >
                {pageBlocks.map((b) => (
                  <div key={b.key}>{b.node}</div>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}

      <PropostaSociosPage />
      <PropostaFechamentoPage fechamento={page.fechamento} />
    </div>
  );
}
