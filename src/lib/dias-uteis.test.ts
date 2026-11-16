import { describe, expect, it } from "vitest";
import {
  contarDiasUteisAposAte,
  domingoDePascoa,
  ehDiaUtil,
  feriadoAnbima,
  feriadosAnbima,
  proximoDiaUtil,
  somarDiasUteis,
} from "./dias-uteis";

describe("feriados ANBIMA", () => {
  it("Páscoa conhecida", () => {
    expect(domingoDePascoa(2024)).toBe("2024-03-31");
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
    expect(domingoDePascoa(2027)).toBe("2027-03-28");
  });

  it("2026 bate com o calendário ANBIMA (13 feriados nacionais)", () => {
    expect([...feriadosAnbima(2026).keys()].sort()).toEqual([
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("Consciência Negra só a partir de 2024", () => {
    expect(feriadoAnbima("2023-11-20")).toBeNull();
    expect(feriadoAnbima("2024-11-20")).toBe("Dia Nacional de Zumbi e da Consciência Negra");
  });
});

describe("dias úteis", () => {
  it("pula fim de semana e feriado", () => {
    expect(ehDiaUtil("2026-11-20")).toBe(false); // sexta, Consciência Negra
    expect(ehDiaUtil("2026-11-21")).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-19")).toBe(true);
    // Caso do teste de 16/11/2026: prazo da base na quinta 19/11, reunião só a partir de segunda 23/11.
    expect(proximoDiaUtil("2026-11-19")).toBe("2026-11-23");
    // Carnaval 2026.
    expect(proximoDiaUtil("2026-02-13")).toBe("2026-02-18");
  });

  it("conta e soma dias úteis", () => {
    expect(contarDiasUteisAposAte("2026-11-16", "2026-11-23")).toBe(4); // 17, 18, 19 e 23
    expect(contarDiasUteisAposAte("2026-11-16", "2026-11-16")).toBe(0);
    expect(contarDiasUteisAposAte("x", "2026-11-16")).toBeNull();
    expect(somarDiasUteis("2026-11-18", 2)).toBe("2026-11-23");
    expect(somarDiasUteis("2026-11-18", 0)).toBe("2026-11-18");
  });
});
