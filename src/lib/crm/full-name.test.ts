import { describe, expect, it } from "vitest";
import { isValidFullNameTokens } from "./full-name";

describe("isValidFullNameTokens", () => {
  it("requires at least two non-empty segments", () => {
    expect(isValidFullNameTokens("João")).toBe(false);
    expect(isValidFullNameTokens("João ")).toBe(false);
    expect(isValidFullNameTokens("Maria")).toBe(false);
  });

  it("accepts nome e sobrenome", () => {
    expect(isValidFullNameTokens("João Silva")).toBe(true);
    expect(isValidFullNameTokens("Maria Souza Costa")).toBe(true);
  });
});
