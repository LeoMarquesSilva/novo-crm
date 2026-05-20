/**
 * Gera `public/MODELO-PROPOSTA-1.docx` com placeholders alinhados ao motor docxtemplater.
 * Corpo: Aptos 12 pt, justificado. No Word pode deixar «Síntese da demanda:» fixo (ex. negrito)
 * e só `[RESUMO]` como variável — ver `splitEscopoTextForDocx` em `proposta-docx-data.ts`.
 * Uso: node scripts/generate-modelo-proposta-docx.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  Document,
  Footer,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "MODELO-PROPOSTA-1.docx");
const tmpPath = path.join(__dirname, "..", "public", ".MODELO-PROPOSTA-1.docx.tmp");

/** docx: tamanho em meios-pontos (12 pt → 24). */
const BODY = { font: "Aptos", size: 24 };

const p = (text) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ ...BODY, text })],
  });

/** Rodapé com campos Word (página atual / total) — recalculados ao abrir no Word. */
const footerPaginas = new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [
    new TextRun({
      ...BODY,
      children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
    }),
  ],
});

const doc = new Document({
  sections: [
    {
      footers: {
        default: new Footer({
          children: [footerPaginas],
        }),
      },
      children: [
        p("MODELO DE PROPOSTA (placeholders para geração automática)"),
        new Paragraph({ children: [new PageBreak()] }),
        p(
          "À [EMPRESA], pessoa jurídica de direito privado, com sede na cidade de [CIDADE]/[UF], na [CEP], [NUMERO] inscrita no CNPJ sob nº [DOCUMENTO] (“Cliente”).",
        ),
        p(""),
        p("[AREA]"),
        p(""),
        p("[ESCOPO_ANTES_SINTESE]"),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({
              ...BODY,
              bold: true,
              boldComplexScript: true,
              text: "Síntese da demanda: ",
            }),
            new TextRun({ ...BODY, text: "[RESUMO]" }),
          ],
        }),
        p(""),
        p("[INVESTIMENTO]"),
        p(""),
        p("Data de vigência proposta: [DATA VIGENCIA]"),
      ],
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(tmpPath, buf);
try {
  fs.renameSync(tmpPath, outPath);
} catch (e) {
  if (e && (e.code === "EBUSY" || e.code === "EPERM")) {
    const alt = path.join(path.dirname(outPath), "MODELO-PROPOSTA-1.generated.docx");
    fs.renameSync(tmpPath, alt);
    console.warn("Não foi possível sobrescrever MODELO-PROPOSTA-1.docx (ficheiro aberto?). Escrito:", alt);
  } else {
    throw e;
  }
}
console.log("Escrito:", outPath);
