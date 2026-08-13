import { describe, expect, it } from "vitest";
import { validateScopeImportFiles } from "./validate-files";

describe("validateScopeImportFiles", () => {
  it("aceita PDF e DOCX válidos", () => {
    expect(
      validateScopeImportFiles([
        { name: "proposta.pdf", size: 1024, contentType: "application/pdf" },
        {
          name: "contrato.docx",
          size: 2048,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ]),
    ).toBeNull();
  });

  it("rejeita extensão inválida", () => {
    expect(
      validateScopeImportFiles([{ name: "planilha.xlsx", size: 100, contentType: "" }]),
    ).toMatch(/não suportado/i);
  });

  it("rejeita lote vazio", () => {
    expect(validateScopeImportFiles([])).toMatch(/ao menos um/i);
  });
});
