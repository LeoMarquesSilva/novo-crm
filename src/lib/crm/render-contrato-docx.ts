import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { generateContratoDocxBuffer } from "./generate-contrato-docx";
import type { ContratoDocumentPagePreview } from "./contrato-docx-data";

/** Nome fixo do modelo oficial do contrato (cabeçalho/rodapé reais da firma). */
export const MODELO_CONTRATO_FILENAME = "MODELO_CONTRATO_RODAPE.docx" as const;

/**
 * Marcador inserido no corpo do modelo (`templates/contrato/...`), no lugar
 * onde o corpo do contrato gerado é inserido. Ver `word/document.xml` do
 * modelo — vira um parágrafo com esse texto literal, substituído por completo
 * pelo XML gerado (não é um placeholder simples de valor único).
 */
const BODY_MARKER = "[CORPO_CONTRATO]";

/** Caminho absoluto do modelo Word do contrato. Nunca lido de `public/` — mesmo
 * motivo do modelo da proposta: não expor o modelo jurídico via URL pública. */
export function resolveModeloContratoTemplatePath(cwd: string = process.cwd()): string {
  const p = path.resolve(cwd, "templates", "contrato", MODELO_CONTRATO_FILENAME);
  if (fs.existsSync(p)) return p;
  throw new Error(`Template oficial do contrato ausente em templates/contrato/${MODELO_CONTRATO_FILENAME}.`);
}

export function readModeloContratoTemplateBuffer(cwd?: string): Buffer {
  return fs.readFileSync(resolveModeloContratoTemplatePath(cwd));
}

/**
 * Extrai os elementos de bloco (`<w:p>`, `<w:tbl>`...) de dentro de `<w:body>`
 * de um .docx gerado pela biblioteca `docx`, descartando o `<w:sectPr>` final
 * (propriedades de página/cabeçalho/rodapé) — no documento fundido queremos
 * ficar só com o `<w:sectPr>` do MODELO, que referencia o cabeçalho/rodapé reais.
 */
function extractBodyBlocksXml(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const bodyMatch = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
  if (!bodyMatch) {
    throw new Error("word/document.xml gerado sem <w:body> — não foi possível extrair o corpo do contrato.");
  }
  // O <w:sectPr> de um documento de seção única é sempre o último filho direto
  // de <w:body> — removê-lo por ancoragem no fim da string é seguro aqui (o
  // conteúdo gerado por generate-contrato-docx.ts não tem seções internas).
  return bodyMatch[1].replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>\s*$/, "");
}

/**
 * Gera o .docx final do contrato inserindo o corpo (objeto, cláusulas,
 * honorários, folha de assinaturas...) dentro do modelo Word oficial da firma
 * — que já traz o cabeçalho/rodapé reais (logo + endereço, imagem única
 * cobrindo a página inteira) e a numeração de página (`Página X de Y`).
 *
 * Sem isso, o contrato era gerado 100% programaticamente (biblioteca `docx`,
 * sem modelo nenhum) — funcionava, mas nunca teve o cabeçalho/rodapé de
 * verdade da firma, só uma aproximação em texto.
 */
export async function renderContratoDocx(
  page: ContratoDocumentPagePreview,
  templateBuffer: Buffer = readModeloContratoTemplateBuffer(),
): Promise<Buffer> {
  const generatedBuf = Buffer.from(await generateContratoDocxBuffer(page, { standaloneBranding: false }));
  const bodyBlocksXml = extractBodyBlocksXml(generatedBuf);

  const zip = new PizZip(templateBuffer);
  const templateXml = zip.file("word/document.xml")?.asText() ?? "";

  const markerParagraphRe = new RegExp(
    `<w:p\\b(?:(?!</w:p>)[\\s\\S])*?${BODY_MARKER.replace(/[[\]]/g, "\\$&")}(?:(?!</w:p>)[\\s\\S])*?</w:p>`,
  );
  if (!markerParagraphRe.test(templateXml)) {
    throw new Error(
      `Marcador ${BODY_MARKER} não encontrado no modelo do contrato — o template pode ter sido substituído sem o marcador. Veja render-contrato-docx.ts.`,
    );
  }
  const mergedXml = templateXml.replace(markerParagraphRe, bodyBlocksXml);
  zip.file("word/document.xml", mergedXml);

  // Datas determinísticas no ZIP — mesmos dados e modelo geram os mesmos bytes
  // (facilita comparar versões geradas em momentos diferentes).
  for (const file of Object.values(zip.files)) file.date = new Date("2000-01-01T00:00:00Z");

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
