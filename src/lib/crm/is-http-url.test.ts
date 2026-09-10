import { describe, expect, it } from "vitest";
import { isHttpUrl } from "./is-http-url";

describe("isHttpUrl", () => {
  it("aceita http e https", () => {
    expect(isHttpUrl("https://sharepoint.local/proposta")).toBe(true);
    expect(isHttpUrl("http://intranet.local/ppt")).toBe(true);
  });

  it("rejeita valor vazio ou protocolo inválido", () => {
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl("sharepoint.local/proposta")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});
