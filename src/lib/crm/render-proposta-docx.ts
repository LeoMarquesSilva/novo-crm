import fs from "fs";
import path from "path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/** Nome fixo do template legado na pasta `public/` do Next. */
export const MODELO_PROPOSTA_FILENAME = "MODELO-PROPOSTA-1.docx" as const;

/** Caminho absoluto do modelo Word usado na geração da proposta. */
export function resolveModeloPropostaTemplatePath(
  cwd: string = process.cwd(),
  templatePath: string = MODELO_PROPOSTA_FILENAME,
): string {
  const safeTemplatePath = templatePath.replace(/^[/\\]+/, "");
  const publicRoot = path.resolve(cwd, "public");
  const p = path.resolve(publicRoot, safeTemplatePath);
  if (!p.startsWith(publicRoot)) {
    throw new Error("Caminho do modelo Word inválido.");
  }
  if (fs.existsSync(p)) return p;
  throw new Error(
    `Modelo Word não encontrado em public/${safeTemplatePath}. Coloque o arquivo em crm/public/ ou execute pnpm run generate:modelo-proposta para um modelo mínimo.`,
  );
}

export function readModeloPropostaTemplateBuffer(cwd?: string, templatePath?: string): Buffer {
  const p = resolveModeloPropostaTemplatePath(cwd, templatePath);
  return fs.readFileSync(p);
}

/**
 * Substitui placeholders `[chave]` no .docx (conteúdo + rodapés).
 * `[P]` e `[F]` vêm dos dados (`buildPropostaDocxTemplateData`) como texto; no modelo atual
 * o rodapé usa caixa de texto e campos PAGE/NUMPAGES em OOXML podem corromper o arquivo.
 */
export function renderPropostaDocx(templateBuffer: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "[", end: "]" },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  const out = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
