import { describe, expect, it } from "vitest";

import {
  isAllowedD4SignTypePost,
  isPayloadLengthAllowed,
  verifySharedSecret,
} from "./security";

describe("verifySharedSecret", () => {
  it("aceita somente segredos idênticos", () => {
    expect(verifySharedSecret("segredo-correto", "segredo-correto")).toBe(true);
    expect(verifySharedSecret("segredo-correto", "segredo-incorreto")).toBe(false);
  });

  it("falha fechado quando qualquer segredo está ausente", () => {
    expect(verifySharedSecret(undefined, "enviado")).toBe(false);
    expect(verifySharedSecret("esperado", null)).toBe(false);
  });

  it("não lança exceção quando os tamanhos diferem", () => {
    expect(verifySharedSecret("a", "muito-maior")).toBe(false);
  });
});

describe("isPayloadLengthAllowed", () => {
  it("aceita tamanho ausente ou dentro do limite", () => {
    expect(isPayloadLengthAllowed(null, 20_000)).toBe(true);
    expect(isPayloadLengthAllowed("20000", 20_000)).toBe(true);
  });

  it("rejeita tamanho inválido, negativo ou acima do limite", () => {
    expect(isPayloadLengthAllowed("20001", 20_000)).toBe(false);
    expect(isPayloadLengthAllowed("-1", 20_000)).toBe(false);
    expect(isPayloadLengthAllowed("abc", 20_000)).toBe(false);
  });
});

describe("isAllowedD4SignTypePost", () => {
  it.each(["1", "2", "3", "4"])("aceita o evento oficial %s", (typePost) => {
    expect(isAllowedD4SignTypePost(typePost)).toBe(true);
  });

  it("rejeita um tipo desconhecido", () => {
    expect(isAllowedD4SignTypePost("processing")).toBe(false);
  });
});
