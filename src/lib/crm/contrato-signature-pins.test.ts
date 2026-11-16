import { describe, expect, it } from "vitest";
import { buildDefaultSignaturePins, D4SIGN_A4_HEIGHT, D4SIGN_A4_WIDTH } from "./contrato-signature-pins";

describe("buildDefaultSignaturePins", () => {
  it("segue a folha empilhada: Gustavo, Ricardo e cliente no centro, de cima para baixo", () => {
    const pins = buildDefaultSignaturePins();
    expect(pins.map((p) => p.email)).toEqual(["gustavo@bpplaw.com.br", "ricardo@bpplaw.com.br", "__client__"]);
    expect(new Set(pins.map((p) => p.position_x))).toEqual(new Set([411]));
    const ys = pins.map((p) => p.position_y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    for (const p of pins) {
      expect(p.page_width).toBe(D4SIGN_A4_WIDTH);
      expect(p.page_height).toBe(D4SIGN_A4_HEIGHT);
    }
  });
});
