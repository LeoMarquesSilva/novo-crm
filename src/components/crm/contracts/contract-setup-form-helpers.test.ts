import { describe, expect, it } from "vitest";

import {
  basisPointsToMaskedPercent,
  basisPointsToPercentText,
  percentTextToBasisPoints,
  sanitizePercentTyping,
} from "./contract-setup-form-helpers";

describe("percentual digitado no contrato", () => {
  it("o número digitado é o próprio percentual", () => {
    // Antes a máscara de centavos transformava 5 em 0,05%.
    expect(percentTextToBasisPoints(sanitizePercentTyping("5")!)).toBe(500);
    expect(basisPointsToMaskedPercent(500)).toBe("5,00%");
    expect(percentTextToBasisPoints(sanitizePercentTyping("12,5")!)).toBe(1250);
    expect(percentTextToBasisPoints(sanitizePercentTyping("12.25")!)).toBe(1225);
    expect(percentTextToBasisPoints(sanitizePercentTyping("100%")!)).toBe(10000);
  });

  it("aceita texto intermediário e recusa o que não é percentual", () => {
    expect(sanitizePercentTyping("12,")).toBe("12,");
    expect(percentTextToBasisPoints("12,")).toBe(1200);
    expect(sanitizePercentTyping("")).toBe("");
    expect(percentTextToBasisPoints("")).toBeNull();
    expect(sanitizePercentTyping("1,234")).toBeNull();
    expect(sanitizePercentTyping("1000")).toBeNull();
    expect(sanitizePercentTyping("5a")).toBeNull();
  });

  it("volta ao texto editável sem zeros sobrando", () => {
    expect(basisPointsToPercentText(1500)).toBe("15");
    expect(basisPointsToPercentText(1250)).toBe("12,5");
    expect(basisPointsToPercentText(null)).toBe("");
  });
});
