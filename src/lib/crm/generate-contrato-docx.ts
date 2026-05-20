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
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { ContratoDocumentPagePreview } from "./contrato-docx-data";

// ─── Constantes tipográficas ──────────────────────────────────────────────────

const FONT = "Times New Roman";
const PT11 = 22; // 11 pt em meios-pontos (half-points)
const PT10 = 20;
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
const NO_BORDER: BorderDef = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

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

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function generateContratoDocxBuffer(
  page: ContratoDocumentPagePreview,
): Promise<Buffer> {
  const ELLIPSIS = "…";

  // Separa o nome da empresa (negrito) do restante da qualificação
  const qualRaw = (page.qualificacao || "").replace(/\.\s*$/, ""); // remove ponto final
  const comma = qualRaw.indexOf(",");
  const companyName = comma >= 0 ? qualRaw.slice(0, comma).trim() : qualRaw;
  const companyDetail = comma >= 0 ? qualRaw.slice(comma) : ""; // começa com ","

  const hasLimitacoes = !!(page.limiteProcessos || page.limiteHoras);
  const hasExito = !!page.exitoAreas && !(page.areas?.some((a) => a.key === "exito"));
  // hasPrazo legado: mantém compat com dados antigos que ainda usam cc_prazo_confeccao
  const hasPrazo = !!page.prazoConfeccao && !page.prazoRevisao;

  // Numeração dinâmica de cláusulas
  let cn = 0;
  const N = () => `${++cn}.`;

  const children: (Paragraph | Table)[] = [];

  // ── Cabeçalho / Logomarca ───────────────────────────────────────────────────
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

  // ── Título ──────────────────────────────────────────────────────────────────
  children.push(
    para([run("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS", true)], {
      align: AlignmentType.CENTER,
      after: 0,
      borderBottom: true,
    }),
  );
  children.push(para([], { after: 220 }));

  // ── Abertura ────────────────────────────────────────────────────────────────
  children.push(
    para(
      [run("Pelo presente instrumento particular, as partes a seguir identificadas e qualificadas:")],
      { after: 220 },
    ),
  );

  // ── Qualificação do CONTRATANTE ────────────────────────────────────────────
  children.push(
    para(
      [
        run(companyName || ELLIPSIS, true),
        run(`${companyDetail}, doravante denominada `),
        run('"CONTRATANTE"', true),
        run("."),
      ],
      { after: 220 },
    ),
  );

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
        run("CONTRATANTE", true),
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

  // ── 2. DOS HONORÁRIOS CONTRATUAIS ─────────────────────────────────────────
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
    children.push(...textParagraphs(c.content || "…", 200));
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

  const sigCell = (label: string, sub?: string, extraLines?: string[]) =>
    new TableCell({
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: LINE_DARK },
          spacing: { after: 0 },
          children: [run(label, true)],
        }),
        ...(sub
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: extraLines?.length ? 400 : 0 },
                children: [run(sub, false, PT10)],
              }),
            ]
          : []),
        ...(extraLines ?? []).flatMap((line, i, arr) => [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: LINE_DARK },
            spacing: { before: i === 0 ? 400 : 200, after: 40 },
            children: [],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: i < arr.length - 1 ? 200 : 0 },
            children: [run(line, false, PT10)],
          }),
        ]),
      ],
    });

  const spacerCell = new TableCell({
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
    },
    width: { size: 1800, type: WidthType.DXA },
    children: [new Paragraph({ children: [] })],
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            sigCell("CONTRATANTE"),
            spacerCell,
            sigCell("CONTRATADA", "Bismarchi | Pires – Sociedade de Advogados", [
              "Gustavo Bismarchi Motta",
              "Ricardo Viscardi Pires",
            ]),
          ],
        }),
      ],
    }),
  );

  // ── Rodapé ─────────────────────────────────────────────────────────────────
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
