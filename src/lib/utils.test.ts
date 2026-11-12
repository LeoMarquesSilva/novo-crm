import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn com a escala V2 (12/11/2026)", () => {
  it("mantém o tamanho text-v2-* ao lado de uma cor", () => {
    expect(cn("text-v2-caption-medium", "text-success-text")).toBe("text-v2-caption-medium text-success-text");
  });

  it("um tamanho V2 substitui outro tamanho, como os do Tailwind", () => {
    expect(cn("text-sm", "text-v2-caption")).toBe("text-v2-caption");
    expect(cn("text-v2-caption", "text-v2-heading-md")).toBe("text-v2-heading-md");
  });
});
