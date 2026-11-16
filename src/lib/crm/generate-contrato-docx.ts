/**
 * Gera o DOCX do contrato de forma programática (sem template), usando os mesmos
 * dados que alimentam o preview HTML. Fonte Times New Roman 11 pt, texto justificado.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TextRun,
} from "docx";

import type { ContratoDocumentPagePreview } from "./contrato-docx-data";
import { contractPartyGrammar } from "./contract-engine/party-language";
import { blocosDeAssinatura } from "./contrato-assinaturas";

// ─── Constantes tipográficas ──────────────────────────────────────────────────

const FONT = "Times New Roman";
const PT11 = 22; // 11 pt em meios-pontos (half-points)
const PT13 = 26; // letterhead
const PT8 = 16;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BorderDef = {
  style: (typeof BorderStyle)[keyof typeof BorderStyle];
  size: number;
  color: string;
  space?: number;
};

const LINE_DARK: BorderDef = { style: BorderStyle.SINGLE, size: 6, color: "444444", space: 3 };
/** Folha de assinaturas: recuo de cada lado (o traço fica com ~62% da largura do texto) e espaço para assinar. */
const SIG_INDENT = 1600;
const SIG_ESPACO_PRIMEIRA = 400;
const SIG_ESPACO = 1300;

function run(text: string, bold = false, size = PT11): TextRun {
  return new TextRun({ text, font: FONT, size, bold });
}

function para(
  runs: (TextRun | { break: number })[],
  opts: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number; // twips (1 pt = 20 twips)
    before?: number;
    borderBottom?: boolean;
    borderTop?: boolean;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: {
      after: opts.after ?? 120,
      before: opts.before ?? 0,
    },
    border: opts.borderBottom
      ? { bottom: LINE_DARK }
      : opts.borderTop
        ? { top: LINE_DARK }
        : undefined,
    children: runs as TextRun[],
  });
}

/** Cria parágrafos separados para cada linha de um texto multi-linha. */
function textParagraphs(text: string, after = 200): Paragraph[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) =>
    para([run(line)], { after: i === lines.length - 1 ? after : 60 }),
  );
}

/**
 * Corpo de uma cláusula que agrupa sub-itens (ex.: Objetos Excluídos, Disposições
 * Gerais): texto único quando não há `items`, ou N.1, N.2... numerados com o N
 * já atribuído ao título-pai (`parentNum`) — nunca um número próprio.
 */
function clausulaBodyParagraphs(
  clausula: { content: string; items?: Array<{ title: string; content: string }> },
  parentNum: number,
  fallback: string,
): Paragraph[] {
  if (clausula.items && clausula.items.length > 0) {
    return clausula.items.map((item, j) =>
      para([run(`${parentNum}.${j + 1}. ${item.title}. `, true), run(item.content)], { after: 80 }),
    );
  }
  return textParagraphs(clausula.content || fallback, 200);
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function generateContratoDocxBuffer(
  page: ContratoDocumentPagePreview,
  options?: {
    /**
     * `false` omite o cabeçalho de texto ("BISMARCHI | PIRES"), o título e o
     * rodapé de endereço gerados aqui — usado quando o corpo produzido por
     * esta função vai ser inserido dentro do modelo Word oficial
     * (`render-contrato-docx.ts`), que já traz essa marca gráfica real (logo +
     * endereço) impressa no cabeçalho/rodapé do próprio arquivo. Sem isso, o
     * .docx final duplicaria a marca — uma vez como imagem do modelo, outra
     * como texto gerado aqui. Default `true` preserva o comportamento
     * standalone (sem modelo) para qualquer chamador que não passe a opção.
     */
    standaloneBranding?: boolean;
  },
): Promise<Buffer> {
  const standaloneBranding = options?.standaloneBranding ?? true;
  const ELLIPSIS = "…";

  // Separa o nome (negrito) do restante de cada CONTRATANTE — uma sentença por
  // empresa (ver "qualificacoesPartes"; pode ser mais de uma quando duas
  // empresas do mesmo grupo contratam juntas — ver contractPartyGrammar).
  const qualificacoesPartes =
    page.qualificacoesPartes && page.qualificacoesPartes.length > 0 ? page.qualificacoesPartes : [ELLIPSIS];
  const contratanteGrammar = contractPartyGrammar(qualificacoesPartes.length);
  const qualParties = qualificacoesPartes.map((raw) => {
    const qualRaw = raw.replace(/\.\s*$/, ""); // remove ponto final
    const comma = qualRaw.indexOf(",");
    return {
      name: comma >= 0 ? qualRaw.slice(0, comma).trim() : qualRaw,
      detail: comma >= 0 ? qualRaw.slice(comma) : "", // começa com ","
    };
  });

  const hasLimitacoes = !!(page.limiteProcessos || page.limiteHoras);
  const hasExito = !!page.exitoAreas && !(page.areas?.some((a) => a.key === "exito"));

  // Numeração dinâmica de cláusulas
  let cn = 0;
  const N = () => `${++cn}.`;

  const children: (Paragraph | Table)[] = [];

  if (standaloneBranding) {
    // ── Cabeçalho / Logomarca ─────────────────────────────────────────────────
    children.push(
      para([run("BISMARCHI  |  PIRES", true, PT13)], {
        align: AlignmentType.CENTER,
        after: 20,
      }),
    );
    children.push(
      para([run("SOCIEDADE DE ADVOGADOS", false, PT8)], {
        align: AlignmentType.CENTER,
        after: 220,
        borderBottom: true,
      }),
    );

    // ── Título ────────────────────────────────────────────────────────────────
    children.push(
      para([run("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS", true)], {
        align: AlignmentType.CENTER,
        after: 0,
        borderBottom: true,
      }),
    );
    children.push(para([], { after: 220 }));
  }

  // ── Abertura ────────────────────────────────────────────────────────────────
  children.push(
    para(
      [run("Pelo presente instrumento particular, as partes a seguir identificadas e qualificadas:")],
      { after: 220 },
    ),
  );

  // ── Qualificação do(s) CONTRATANTE(S) ──────────────────────────────────────
  // Uma sentença por empresa; só a última leva o "doravante denominada(s)",
  // já no singular/plural certo (contractPartyGrammar — mesmo utilitário que
  // já pluraliza o resto do contrato quando há mais de uma CONTRATANTE).
  qualParties.forEach(({ name, detail }, i) => {
    const isLast = i === qualParties.length - 1;
    children.push(
      para(
        isLast
          ? [
              run(name || ELLIPSIS, true),
              run(
                `${detail}, doravante ${contratanteGrammar.plural ? "denominadas, em conjunto," : "denominada"} `,
              ),
              run(`"${contratanteGrammar.noun}"`, true),
              run("."),
            ]
          : [run(name || ELLIPSIS, true), run(`${detail}; e`)],
        { after: 220 },
      ),
    );
  });

  // ── Qualificação da CONTRATADA (Bismarchi | Pires — fixo) ─────────────────
  children.push(
    para(
      [
        run("BISMARCHI | PIRES – SOCIEDADE DE ADVOGADOS", true),
        run(
          ", pessoa jurídica de direito privado, inscrita no CNPJ sob o n° 26.080.152/0001-35, com sede na Rua Coronel Quirino, n° 1.266, bairro Cambuí, na Cidade de Campinas, Estado de São Paulo, CEP 13025-002, neste ato representada por seus sócios administradores ",
        ),
        run("GUSTAVO BISMARCHI MOTTA", true),
        run(", inscrito na OAB/SP sob o n° 275.477, e "),
        run("RICARDO VISCARDI PIRES", true),
        run(", inscrito na OAB/SP sob o n° 353.389, doravante denominada "),
        run('"CONTRATADA"', true),
        run("."),
      ],
      { after: 220 },
    ),
  );

  // ── Parágrafo de conjunção ──────────────────────────────────────────────────
  children.push(
    para(
      [
        run(contratanteGrammar.noun, true),
        run(" e "),
        run("CONTRATADA", true),
        run(", quando em conjunto, doravante denominadas "),
        run('"Partes"', true),
        run(" e, individual e indiscriminadamente, "),
        run('"Parte"', true),
        run(
          ", têm entre si, justo e acordado os termos do presente Contrato de Prestação de Serviços Advocatícios (",
        ),
        run('"Contrato"', true),
        run("), o qual reger-se-á pelas seguintes cláusulas e condições."),
      ],
      { after: 360 },
    ),
  );

  // ── 1. OBJETO DO CONTRATO ──────────────────────────────────────────────────
  children.push(
    para([run(`${N()}  OBJETO DO CONTRATO`, true)], { before: 240, after: 100 }),
  );
  children.push(...textParagraphs(page.objeto || ELLIPSIS));

  // ── 2. OBJETOS EXCLUÍDOS DO CONTRATO ──────────────────────────────────────
  if (page.objetosExcluidos) {
    children.push(
      para([run(`${N()}  ${page.objetosExcluidos.title.toUpperCase()}`, true)], {
        before: 240,
        after: 100,
      }),
    );
    children.push(...clausulaBodyParagraphs(page.objetosExcluidos, cn, ELLIPSIS));
  }

  // ── 3. DOS HONORÁRIOS CONTRATUAIS ─────────────────────────────────────────
  children.push(
    para([run(`${N()}  DOS HONORÁRIOS CONTRATUAIS`, true)], { before: 240, after: 100 }),
  );
  children.push(
    ...textParagraphs(
      page.valores || ELLIPSIS,
      page.tipoPagamento || page.investimento ? 80 : 200,
    ),
  );
  if (page.tipoPagamento) {
    children.push(
      para([run("Forma de pagamento: ", true), run(`${page.tipoPagamento}.`)], {
        after: page.investimento ? 80 : 200,
      }),
    );
  }
  if (page.investimento) {
    children.push(
      para([run("Proposta base: ", true), run(`${page.investimento}.`)], { after: 200 }),
    );
  }

  // ── N. DAS LIMITAÇÕES (condicional) ───────────────────────────────────────
  if (hasLimitacoes) {
    children.push(
      para([run(`${N()}  DAS LIMITAÇÕES DE SERVIÇOS`, true)], { before: 240, after: 100 }),
    );
    if (page.limiteProcessos) {
      children.push(
        para([run("Limite de processos: ", true), run(`${page.limiteProcessos}.`)], {
          after: page.limiteHoras ? 80 : 200,
        }),
      );
    }
    if (page.limiteHoras) {
      children.push(
        para([run("Limite de horas mensais: ", true), run(`${page.limiteHoras}.`)], { after: 200 }),
      );
    }
  }

  // ── N. DOS HONORÁRIOS DE ÊXITO (condicional) ──────────────────────────────
  if (hasExito) {
    children.push(
      para([run(`${N()}  DOS HONORÁRIOS DE ÊXITO`, true)], { before: 240, after: 100 }),
    );
    children.push(...textParagraphs(page.exitoAreas));
  }

  // ── N. ÁREAS DE ATUAÇÃO (condicional, por toggle) ─────────────────────────
  if (page.areas && page.areas.length > 0) {
    for (const area of page.areas) {
      if (area.key === "exito") continue; // Êxito tratado separadamente
      children.push(
        para([run(`${N()}  ${area.label.toUpperCase()}`, true)], { before: 240, after: 100 }),
      );
      for (const det of area.details) {
        children.push(
          para([run(`${det.label}: `, true), run(det.value)], { after: 80 }),
        );
      }
    }

    // Honorários de êxito (área especial)
    const exitoArea = page.areas.find((a) => a.key === "exito");
    if (exitoArea) {
      children.push(
        para([run(`${N()}  DOS HONORÁRIOS DE ÊXITO`, true)], { before: 240, after: 100 }),
      );
      for (const det of exitoArea.details) {
        if (det.label === "Detalhamento") {
          children.push(...textParagraphs(det.value));
        } else {
          children.push(
            para([run(`${det.label}: `, true), run(det.value)], { after: 80 }),
          );
        }
      }
    }
  } else if (hasExito) {
    // Compatibilidade legada com cc_exito_areas
    children.push(
      para([run(`${N()}  DOS HONORÁRIOS DE ÊXITO`, true)], { before: 240, after: 100 }),
    );
    children.push(...textParagraphs(page.exitoAreas));
  }

  // ── Cláusulas adicionais (ordenáveis, editáveis por contrato) ──────────────
  for (const c of page.clausulasAdicionais) {
    children.push(
      para([run(`${N()}  ${c.title.toUpperCase()}`, true)], { before: 240, after: 100 }),
    );
    children.push(...clausulaBodyParagraphs(c, cn, "…"));
  }

  // ── Quebra de página → folha dedicada de assinaturas (última página do PDF) ──
  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(
    para([run("PÁGINA DE ASSINATURAS", true)], {
      align: AlignmentType.CENTER,
      after: 80,
    }),
  );
  children.push(
    para(
      [
        run(
          "Em continuação ao Contrato de Prestação de Serviços Advocatícios celebrado entre as Partes.",
        ),
      ],
      { align: AlignmentType.CENTER, after: 600 },
    ),
  );
  children.push(
    para([run(`Campinas/SP, ${page.dataAssinatura || ELLIPSIS}.`)], {
      align: AlignmentType.CENTER,
      after: 1000,
    }),
  );

  // Uma assinatura embaixo da outra, centralizadas, começando pelo escritório; sem "CONTRATANTE"/"CONTRATADA"
  // (16/11/2026). O traço é a borda do parágrafo do título, com recuo dos dois lados para ficar curto e no
  // centro. Antes o traço vinha num parágrafo vazio e o Word juntava bordas iguais seguidas: a linha do
  // cliente nem aparecia. As posições padrão da D4Sign (`contrato-signature-pins.ts`) seguem este layout.
  blocosDeAssinatura(page.contratantesAssinatura).forEach((bloco, i) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: { left: SIG_INDENT, right: SIG_INDENT },
        border: { top: LINE_DARK },
        spacing: { before: i === 0 ? SIG_ESPACO_PRIMEIRA : SIG_ESPACO, after: 0 },
        keepNext: bloco.linhas.length > 0,
        keepLines: true,
        children: [new TextRun({ text: bloco.titulo, font: FONT, size: PT11, bold: true, smallCaps: true })],
      }),
      ...bloco.linhas.map(
        (linha, j) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            keepNext: j < bloco.linhas.length - 1,
            children: [run(linha)],
          }),
      ),
    );
  });

  if (standaloneBranding) {
    // ── Rodapé ───────────────────────────────────────────────────────────────
    children.push(para([], { before: 280, after: 80, borderTop: true }));
    children.push(
      para(
        [
          run(
            "Rua Coronel Quirino, 1.266  —  Cambuí  —  Campinas/SP   ·   (19) 3254-6446   ·   contato@bismarchipires.com.br",
            false,
            PT8,
          ),
        ],
        { align: AlignmentType.CENTER, after: 0 },
      ),
    );
  }

  // ── Documento final ─────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1701,    // ~3 cm em twips
              right: 1701,
              bottom: 1701,
              left: 1701,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
