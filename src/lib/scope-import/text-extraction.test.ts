import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { extractDocumentText } from "./text-extraction";

function buildMinimalDocx(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`,
    )
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;
  const zip = new PizZip();
  zip.file("word/document.xml", documentXml);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

describe("extractDocumentText", () => {
  it("extrai parágrafos de DOCX via PizZip", async () => {
    const buffer = buildMinimalDocx([
      "Proposta para [NOME EMPRESA] com escopo detalhado de representação judicial.",
      "Escopo: representação em ação de cobrança com acompanhamento instrutório e recursal.",
      "Investimento: honorários mensais de [VALORMENSAL] reajustados anualmente pelo IPCA.",
      "Prazo de vigência de 12 meses renovável automaticamente salvo denúncia com 30 dias.",
      "Exclusões: despesas processuais, custas e honorários de sucumbência a terceiros.",
    ]);
    const result = await extractDocumentText(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.text).toContain("[NOME EMPRESA]");
    expect(result.text).toContain("ação de cobrança");
    expect(result.isLikelyScanned).toBe(false);
  });

  it("rejeita formatos desconhecidos", async () => {
    await expect(extractDocumentText(Buffer.from("hello"), "text/plain")).rejects.toThrow(
      /não suportado/i,
    );
  });
});
