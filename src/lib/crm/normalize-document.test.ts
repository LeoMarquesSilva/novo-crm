import { describe, expect, it } from "vitest";
import { digitsOnly, normalizeGroupKey, cnpjRoot, isCnpjMatriz } from "@/lib/crm/normalize-document";

describe("normalizeGroupKey", () => {
  it("iguala o nome do ORQESTRAI ao grupo_cliente do SIOE", () => {
    expect(normalizeGroupKey("Grupo Extrutech")).toBe(normalizeGroupKey("GRUPO EXTRUTECH"));
    expect(normalizeGroupKey("Grupo Le Blog")).toBe("grupo le blog");
    expect(digitsOnly("36.704.785/0001-20")).toBe("36704785000120");
    expect(cnpjRoot("60.494.416/0033-12")).toBe("60494416");
    expect(isCnpjMatriz("60.494.416/0001-35")).toBe(true);
    expect(isCnpjMatriz("60.494.416/0033-12")).toBe(false);
  });
});
