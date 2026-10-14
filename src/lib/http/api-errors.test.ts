import { describe, expect, it, vi } from "vitest";

import {
  documentErrorMessage,
  IntegrationError,
  internalErrorResponse,
  PublicError,
  publicErrorMessage,
} from "./api-errors";

describe("api-errors", () => {
  it("mensagem pública da integração esconde o corpo do provedor", () => {
    const error = new IntegrationError("evolution", "Evolution recusou (HTTP 500).", '{"secret":"abc"}', 500);
    expect(publicErrorMessage(error, "x")).toBe("Evolution recusou (HTTP 500).");
    expect(documentErrorMessage(error, "x")).toBe("Evolution recusou (HTTP 500).");
  });

  it("erro do banco vira texto genérico", () => {
    expect(publicErrorMessage({ message: "column foo does not exist", code: "42703" }, "Falhou.")).toBe("Falhou.");
    expect(documentErrorMessage({ message: "x", code: "42703", details: null }, "Falhou.")).toBe("Falhou.");
  });

  it("internalErrorResponse devolve 500 com ref e sem detalhe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalErrorResponse("teste", new Error("column secret does not exist"), "Erro interno.");
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Erro interno.");
    expect(json.ref).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(json)).not.toContain("column");
  });

  it("PublicError mantém mensagem e status", async () => {
    const res = internalErrorResponse("teste", new PublicError("Lead não encontrado.", 404));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Lead não encontrado.");
  });
});
