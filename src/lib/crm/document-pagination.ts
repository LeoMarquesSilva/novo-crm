import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Bloco de conteúdo de um preview HTML paginado (contrato, proposta, etc.).
 * `forceBreakBefore` força início de página nova antes deste bloco, mesmo que
 * o conteúdo anterior ainda caiba — usado por páginas de arte fixa (folha de
 * assinaturas, capa, sócios...) que nunca dividem espaço com outro conteúdo.
 */
export type PreviewBlock = { key: string; node: ReactNode; forceBreakBefore?: boolean };

/**
 * Corta uma lista de blocos em páginas de verdade — mede a altura real de cada
 * bloco (renderizado escondido num host de mesma largura da página) e agrupa
 * até estourar `pageContentHeight`, começando página nova a cada estouro (ou
 * quando `forceBreakBefore` pede). Extraído de `ContratoBodyPages`
 * (contrato-document-builder.tsx) para reuso pela prévia de proposta — a
 * lógica de medição em si não depende de nenhum estado específico de contrato.
 *
 * Mede pela POSIÇÃO real de cada bloco (topo em relação ao host), não pela
 * altura isolada de cada elemento — somar alturas individuais é sujeito a
 * erro por causa do colapso de margem do CSS (a margin-bottom de um parágrafo
 * "escapa" do próprio elemento e não entra no getBoundingClientRect() dele,
 * mas ainda desloca o próximo elemento). Medindo a diferença entre o topo de
 * um bloco e o do próximo, o efeito do colapso de margem já vem embutido
 * automaticamente.
 *
 * O chamador é responsável por renderizar o host de medição escondido
 * (`measureHostRef`) com os mesmos `blocks` (mais um sentinela final vazio,
 * pra capturar a posição real do fim do último bloco) e a mesma
 * largura/estilo da página real — só assim a quebra de linha medida bate com
 * o que vai aparecer de verdade.
 */
export function usePaginatedBlocks(
  blocks: PreviewBlock[],
  pageContentHeight: number,
): { pages: PreviewBlock[][]; measureHostRef: RefObject<HTMLDivElement | null> } {
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<PreviewBlock[][]>(() => [blocks]);

  useLayoutEffect(() => {
    const host = measureHostRef.current;
    if (!host) return;
    // `children` inclui o sentinela final (renderizado pelo chamador) — usado
    // só pra capturar a posição real do fim do último bloco, já que a própria
    // altura do host não inclui a margin-bottom do último filho quando ela
    // colapsa "através" do host (o host não tem padding/borda pra conter a
    // margem).
    const hostTop = host.getBoundingClientRect().top;
    const children = Array.from(host.children);
    const tops = children.map((el) => el.getBoundingClientRect().top - hostTop);
    const heights = blocks.map((_, i) => (tops[i + 1] ?? 0) - tops[i]);

    const result: PreviewBlock[][] = [];
    let current: PreviewBlock[] = [];
    let currentHeight = 0;
    blocks.forEach((block, i) => {
      const h = heights[i] ?? 0;
      const mustBreak = Boolean(block.forceBreakBefore) && current.length > 0;
      const overflows = current.length > 0 && currentHeight + h > pageContentHeight;
      if (mustBreak || overflows) {
        result.push(current);
        current = [];
        currentHeight = 0;
      }
      current.push(block);
      currentHeight += h;
    });
    if (current.length > 0) result.push(current);
    // Paginação depende da altura real renderizada (fonte, largura, quebra de
    // linha) — não dá pra calcular isso durante o render, só depois que o DOM
    // de medição existe. Mesmo padrão de "measure then setState" documentado
    // pelo React para useLayoutEffect (react.dev/learn/you-might-not-need-an-effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPages(result.length > 0 ? result : [[]]);
  }, [blocks, pageContentHeight]);

  return { pages, measureHostRef };
}
