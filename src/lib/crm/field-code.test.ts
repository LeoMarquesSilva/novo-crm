import { describe, expect, it } from "vitest";
import { normalizeLabelKey, slugifyFieldCodeFromLabel } from "./field-code";

describe("normalizeLabelKey", () => {
  it("treats labels differing only by accents as equal", () => {
    expect(normalizeLabelKey("Razão Social [CP]")).toBe(normalizeLabelKey("Razao Social [CP]"));
  });

  it("collapses internal whitespace", () => {
    expect(normalizeLabelKey("Razão   Social")).toBe(normalizeLabelKey("Razão Social"));
  });

  it("matches the accent-stripping behavior of slugify base", () => {
    const a = normalizeLabelKey("Áreas objeto do contrato [CP]");
    const b = normalizeLabelKey("Areas objeto do contrato [CP]");
    expect(a).toBe(b);
    expect(slugifyFieldCodeFromLabel("Áreas objeto [CP]")).toContain("areas");
  });
});
