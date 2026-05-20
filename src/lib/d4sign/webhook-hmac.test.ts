import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyD4SignContentHmac } from "./webhook-hmac";

describe("verifyD4SignContentHmac", () => {
  it("aceita cabeçalho com prefixo sha256=", () => {
    const secret = "test-secret";
    const uuid = "9f08bf18-bf4b-410f-9701-c286e5b1cad1";
    const hex = createHmac("sha256", secret).update(uuid, "utf8").digest("hex");
    expect(verifyD4SignContentHmac(uuid, secret, `sha256=${hex}`)).toBe(true);
  });

  it("aceita hex sem prefixo", () => {
    const secret = "another";
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const hex = createHmac("sha256", secret).update(uuid, "utf8").digest("hex");
    expect(verifyD4SignContentHmac(uuid, secret, hex)).toBe(true);
  });

  it("rejeita secret errado", () => {
    const uuid = "9f08bf18-bf4b-410f-9701-c286e5b1cad1";
    const hex = createHmac("sha256", "good").update(uuid, "utf8").digest("hex");
    expect(verifyD4SignContentHmac(uuid, "bad", `sha256=${hex}`)).toBe(false);
  });

  it("rejeita header vazio", () => {
    expect(verifyD4SignContentHmac("uuid", "secret", null)).toBe(false);
  });
});
