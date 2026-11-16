import { describe, expect, it } from "vitest";
import {
  ICP_DEBTORS_CSV_HEADER,
  NO_PAYMENT,
  buildDebtorsCsv,
  debtorsInScope,
  debtorsOf,
  overdueAgeLabel,
  overdueByAge,
  overdueByArea,
  overdueByTier,
  overdueTotalRow,
} from "@/components/crm/icp/icp-overdue";
import { icpFixtureData } from "@/components/crm/icp/icp-test-fixture";

describe("inadimplência", () => {
  const data = icpFixtureData();
  const debtors = debtorsOf(data);

  it("junta pagantes e quem não pagou em 12 meses, do maior atraso para o menor", () => {
    expect(debtors.map((d) => [d.grupo, d.tier, d.overdue])).toEqual([
      ["Grupo Gama", "C", 20_000],
      ["Grupo Ômega", NO_PAYMENT, 15_000],
      ["Grupo Alfa", "A", 7_000],
    ]);
    expect(debtors.find((d) => d.grupo === "Grupo Ômega")).toMatchObject({ group: null, revenue12m: 0 });
    expect(debtorsInScope(debtors, "core").map((d) => d.grupo)).toEqual(["Grupo Alfa"]);
    expect(debtorsInScope(debtors, NO_PAYMENT).map((d) => d.grupo)).toEqual(["Grupo Ômega"]);
  });

  it("resume por faixa, com a linha de quem não pagou e a parte de todo o atraso", () => {
    const rows = overdueByTier(data, debtors);
    expect(rows.map((r) => r.key)).toEqual(["A", "B", "C", "D", "E", NO_PAYMENT]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("A")).toMatchObject({ groups: 1, debtors: 1, overdue: 7_000, revenue: 250_000, avgPerDebtor: 7_000 });
    expect(byKey.get("A")!.share).toBeCloseTo(7 / 42);
    expect(byKey.get("B")).toMatchObject({ debtors: 0, overdue: 0, avgPerDebtor: null, ratio: 0 });
    expect(byKey.get("C")!.ratio).toBeCloseTo(20 / 30);
    expect(byKey.get("C")!.aging.mais365).toBe(20_000);
    expect(byKey.get(NO_PAYMENT)).toMatchObject({ groups: 1, debtors: 1, overdue: 15_000, revenue: null, ratio: null });

    const paying = overdueTotalRow(rows.filter((r) => r.key !== NO_PAYMENT), 42_000);
    expect(paying).toMatchObject({ debtors: 2, overdue: 27_000, revenue: 388_000 });
    expect(paying.ratio).toBeCloseTo(27 / 388);
    const office = overdueTotalRow(rows, 42_000);
    expect(office).toMatchObject({ debtors: 3, overdue: 42_000, share: 1 });
    expect(office.aging).toEqual({ ate30: 7_000, "31a90": 0, "91a180": 0, "181a365": 15_000, mais365: 20_000 });
  });

  it("separa por tempo de atraso e por área que emitiu a cobrança", () => {
    expect(overdueByAge(debtors).map((a) => [a.key, a.value, a.groups])).toEqual([
      ["ate30", 7_000, 1],
      ["31a90", 0, 0],
      ["91a180", 0, 0],
      ["181a365", 15_000, 1],
      ["mais365", 20_000, 1],
    ]);
    expect(overdueByArea(debtors).map((a) => [a.key, a.value, a.groups])).toEqual([
      ["Trabalhista", 20_000, 1],
      ["Cível", 15_000, 1],
      ["Insolvência", 7_000, 1],
    ]);
  });

  it("escreve há quanto tempo venceu", () => {
    expect(overdueAgeLabel(1)).toBe("há 1 dia");
    expect(overdueAgeLabel(21)).toBe("há 21 dias");
    expect(overdueAgeLabel(183)).toBe("há 6 meses");
    expect(overdueAgeLabel(487)).toBe("há mais de 1 ano");
    expect(overdueAgeLabel(800)).toBe("há mais de 2 anos");
  });

  it("gera o CSV dos devedores com o envelhecimento em colunas", () => {
    const csv = buildDebtorsCsv(debtors, data.windowEnd);
    const [header, gama, omega] = csv.replace(/^﻿/, "").split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe(ICP_DEBTORS_CSV_HEADER.join(";"));
    expect(gama).toBe("C;Gama;20000;30000;67;01/06/2025;487;0;0;0;0;20000;Trabalhista (20000);0;0");
    expect(omega).toBe("Sem pagamento em 12 meses;Ômega;15000;;;01/04/2026;183;0;0;0;15000;0;Cível (15000);0;0");
  });
});
