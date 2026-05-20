import { describe, expect, it } from "vitest";
import { buildGeneratedDocxFilePath, sanitizeFilenamePart } from "./proposta-document-data";

describe("proposta document data", () => {
  it("sanitiza nomes de arquivo", () => {
    expect(sanitizeFilenamePart('ACME: "Teste"/Contrato?')).toBe("ACME TesteContrato");
  });

  it("monta caminho versionado para DOCX gerado", () => {
    expect(
      buildGeneratedDocxFilePath({
        oportunidadeId: "00000000-0000-0000-0000-000000000001",
        versionNumber: 3,
        generatedAt: new Date("2026-04-24T12:30:00"),
        baseName: "ACME Ltda",
      }),
    ).toBe("documentos/propostas/00000000-0000-0000-0000-000000000001/v3-ACME Ltda-2026-04-24-1230.docx");
  });
});
