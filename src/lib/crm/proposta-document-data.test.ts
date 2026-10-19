import { describe, expect, it } from "vitest";
import {
  buildGeneratedContratoDocxFilePath,
  buildGeneratedDocxFilePath,
  sanitizeFilenamePart,
} from "./proposta-document-data";

describe("proposta document data", () => {
  it("sanitiza nomes de arquivo", () => {
    expect(sanitizeFilenamePart('ACME: "Teste"/Contrato?')).toBe("ACME TesteContrato");
  });

  it("remove o que o Supabase Storage recusa na chave e mantém acentos", () => {
    expect(sanitizeFilenamePart("TESTE E2E [RD] - RENATO MAROTTA STAREK")).toBe(
      "TESTE E2E RD - RENATO MAROTTA STAREK",
    );
    expect(sanitizeFilenamePart("Construção & Cia. #1 {50%} – São João")).toBe("Construção & Cia. 1 50 São João");
    // Acento decomposto (NFD) vira a letra acentuada.
    expect(sanitizeFilenamePart("Joa\u0303o")).toBe("João");
    expect(sanitizeFilenamePart("[]{}")).toBe("lead");
  });

  it("gera chave aceita pelo Storage para lead com colchetes no nome", () => {
    const path = buildGeneratedDocxFilePath({
      oportunidadeId: "00000000-0000-0000-0000-000000000001",
      versionNumber: 1,
      generatedAt: new Date("2026-10-18T12:30:00"),
      baseName: "TESTE E2E [RD] Renato",
    });
    // Mesma regra de chave segura do Storage (S3), com as letras acentuadas que ele aceita.
    expect(path).toMatch(/^[\w\/!\-.*'() &$@=;:+,?\u00C0-\u017F]+$/);
    expect(path).not.toMatch(/[[\]]/);
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

  it("separa contratos novos da pasta de propostas", () => {
    expect(
      buildGeneratedContratoDocxFilePath({
        oportunidadeId: "00000000-0000-0000-0000-000000000001",
        versionNumber: 2,
        generatedAt: new Date("2026-04-24T12:30:00"),
        baseName: "ACME Ltda",
      }),
    ).toBe(
      "documentos/contratos/00000000-0000-0000-0000-000000000001/v2-ACME Ltda-2026-04-24-1230.docx",
    );
  });
});
