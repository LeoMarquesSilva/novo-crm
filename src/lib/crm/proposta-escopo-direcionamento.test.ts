import { describe, expect, it } from "vitest";
import {
  areaHasEscopoTipoFilled,
  extractTiposByAreaFromEscopoJson,
  extractTipoByAreaFromEscopoJson,
  getEscopoDirecionamentoHint,
  mergeEscopoJsonWithAreaTipos,
} from "./proposta-escopo-direcionamento";
import { PROPOSTA_TIPOS_CATALOG } from "@/data/proposta-tipos-catalog";

describe("proposta-escopo-direcionamento", () => {
  it("grava um tipo por área no JSON de escopo", () => {
    const json = mergeEscopoJsonWithAreaTipos("", ["Trabalhista"], {
      Trabalhista: ["contencioso"],
    });
    const parsed = JSON.parse(json) as Record<string, { tipoId: string }[]>;
    expect(parsed.Trabalhista).toHaveLength(1);
    expect(parsed.Trabalhista[0].tipoId).toBe("contencioso");
  });

  it("grava vários tipos por área", () => {
    const json = mergeEscopoJsonWithAreaTipos("", ["Cível"], {
      Cível: ["contencioso", "consultivo"],
    });
    const parsed = JSON.parse(json) as Record<string, { tipoId: string }[]>;
    expect(parsed.Cível.map((e) => e.tipoId)).toEqual(["contencioso", "consultivo"]);
  });

  it("extrai lista de tipos do JSON", () => {
    const raw = JSON.stringify({
      Cível: [
        { id: "1", tipoId: "contencioso", subtipoId: "" },
        { id: "2", tipoId: "consultivo", subtipoId: "" },
      ],
    });
    expect(extractTiposByAreaFromEscopoJson(raw, ["Cível"]).Cível).toEqual([
      "contencioso",
      "consultivo",
    ]);
  });

  it("extractTipoByAreaFromEscopoJson mantém primeiro tipo", () => {
    const raw = JSON.stringify({
      Cível: [
        { id: "1", tipoId: "contencioso", subtipoId: "" },
        { id: "2", tipoId: "consultivo", subtipoId: "" },
      ],
    });
    expect(extractTipoByAreaFromEscopoJson(raw, ["Cível"]).Cível).toBe("contencioso");
  });

  it("areaHasEscopoTipoFilled", () => {
    expect(areaHasEscopoTipoFilled({ Cível: [] }, "Cível")).toBe(false);
    expect(areaHasEscopoTipoFilled({ Cível: ["contencioso"] }, "Cível")).toBe(true);
  });

  it("hint com vários tipos", () => {
    const hint = getEscopoDirecionamentoHint(PROPOSTA_TIPOS_CATALOG, "Cível", [
      "contencioso",
      "consultivo",
    ]);
    expect(hint).toContain("Direcionamento na reunião:");
    expect(hint).toContain("·");
  });
});
