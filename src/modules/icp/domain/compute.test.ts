import { describe, expect, it } from "vitest";
import {
  computeIcp,
  employeeBandOf,
  planSummary,
  rankedGroups,
  revenuePerHour,
  normalizePracticeArea,
  typicalEmployeeRange,
  sizeBuckets,
  type IcpInput,
} from "@/modules/icp/domain/compute";

const NOW = new Date("2026-10-01T12:00:00Z");

function baseInput(overrides: Partial<IcpInput> = {}): IcpInput {
  return {
    now: NOW,
    revenue: [],
    excludedPayers: { count: 0, revenue: 0 },
    processes: [],
    pessoas: [],
    overdue: [],
    hours: [],
    personnelCost: [],
    companies: [],
    nps: [],
    npsThemes: [],
    linkedin: [],
    ga4Cities: [],
    whatsapp: [],
    profiles: [],
    ...overrides,
  };
}

const pay = (grupo: string, departamento: string, valor: number, planoContas = "HONORÁRIOS MENSAIS", dataPagamento = "2026-03-10") => ({
  grupo,
  departamento,
  planoContas,
  valor,
  dataPagamento,
});

describe("icp helpers", () => {
  it("normaliza áreas de prática do VIOS", () => {
    expect(normalizePracticeArea("Cível | Insolvência")).toBe("Insolvência");
    expect(normalizePracticeArea("InsolvÃªncia")).toBe("Insolvência");
    expect(normalizePracticeArea("Special Situations")).toBe("Distressed Deals");
    expect(normalizePracticeArea("Facilities")).toBeNull();
  });
});

describe("computeIcp", () => {
  it("classifica faixas e concentração só com pagamentos dos últimos 12 meses", () => {
    const data = computeIcp(
      baseInput({
        revenue: [
          pay("Grupo Alfa", "Insolvência", 150_000),
          pay("Grupo Alfa", "Trabalhista", 60_000),
          pay("Grupo Alfa", "Cível", 40_000),
          pay("Grupo Beta", "Cível", 80_000, "HONORÁRIOS SPOT"),
          pay("Grupo Gama", "Trabalhista", 10_000, "HONORÁRIOS DE ÊXITO"),
          pay("Grupo Gama", "Trabalhista", 500_000, "HONORÁRIOS MENSAIS", "2025-08-01"),
        ],
      })
    );

    expect(data.windowStart).toBe("2025-10-01");
    expect(data.totals.revenue12m).toBe(340_000);
    expect(data.groups.map((g) => [g.grupo, g.tier])).toEqual([
      ["Grupo Alfa", "A"],
      ["Grupo Beta", "B"],
      ["Grupo Gama", "D"],
    ]);
    expect(data.totals.groupsFor50).toBe(1);
    expect(data.totals.coreGroups).toBe(2);
    expect(data.groups[0].areas).toEqual(["Insolvência", "Trabalhista", "Cível"]);
    expect(data.groups[0].hasRetainer).toBe(true);
    expect(data.groups[1].hasRetainer).toBe(false);
    // O honorário mensal de Gama é de antes da janela: no período só há êxito.
    expect(data.groups.map((g) => Object.keys(g.revenueByPlan))).toEqual([
      ["HONORÁRIOS MENSAIS"],
      ["HONORÁRIOS SPOT"],
      ["HONORÁRIOS DE ÊXITO"],
    ]);
    expect(data.breadth.find((b) => b.label === "3 ou mais")?.groups).toBe(1);
  });

  it("guarda a receita de cada grupo por plano de contas, com o nome do SIOE", () => {
    const data = computeIcp(
      baseInput({
        revenue: [
          pay("Grupo Alfa", "Cível", 90_000, "HONORÁRIOS MENSAIS"),
          pay("Grupo Alfa", "Cível", 10_000, "HONORARIOS SPOT"),
          pay("Grupo Beta", "Cível", 70_000, "HONORÁRIOS DE MANUTENÇÃO"),
        ],
      })
    );

    const byGroup = Object.fromEntries(data.groups.map((g) => [g.grupo, g]));
    expect(byGroup["Grupo Alfa"].revenueByPlan).toEqual({ "HONORÁRIOS MENSAIS": 90_000, "HONORÁRIOS SPOT": 10_000 });
    expect(byGroup["Grupo Alfa"].hasRetainer).toBe(true);
    // Honorário mensal é só o plano HONORÁRIOS MENSAIS, como no SIOE.
    expect(byGroup["Grupo Beta"].hasRetainer).toBe(false);
  });

  it("com filtro de área, os planos acompanham a receita da área", () => {
    const data = computeIcp(
      baseInput({
        revenue: [
          pay("Grupo Alfa", "Cível", 90_000, "HONORÁRIOS MENSAIS"),
          pay("Grupo Alfa", "Trabalhista", 10_000, "HONORÁRIOS SPOT"),
        ],
      })
    );

    const [civel] = rankedGroups(data.groups, "Cível");
    expect(civel.revenue).toBe(90_000);
    expect(civel.revenueByPlan).toEqual({ "HONORÁRIOS MENSAIS": 90_000 });
    const [trabalhista] = rankedGroups(data.groups, "Trabalhista");
    expect(trabalhista.revenueByPlan).toEqual({ "HONORÁRIOS SPOT": 10_000 });
    const [todos] = rankedGroups(data.groups, null);
    expect(todos.revenueByPlan).toEqual({ "HONORÁRIOS MENSAIS": 90_000, "HONORÁRIOS SPOT": 10_000 });
  });

  it("conta as pastas ativas do grupo, no total e por área", () => {
    const data = computeIcp(
      baseInput({
        revenue: [
          pay("Grupo Alfa", "Cível", 90_000, "HONORÁRIOS MENSAIS"),
          pay("Grupo Alfa", "Trabalhista", 10_000, "HONORÁRIOS SPOT"),
        ],
        activeFolders: [
          { grupo: "Grupo Alfa", area: "Cível" },
          { grupo: "Grupo Alfa", area: "Cível" },
          { grupo: "Grupo Alfa", area: "Trabalhista" },
          { grupo: "Grupo Sem Receita", area: "Cível" },
        ],
      })
    );

    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].activeFolders).toBe(3);
    expect(rankedGroups(data.groups, "Cível")[0].folders).toBe(2);
    expect(rankedGroups(data.groups, "Trabalhista")[0].folders).toBe(1);
    expect(sizeBuckets(data.groups, null)[0].folders).toBe(3);
  });

  it("calcula a receita média por hora só com quem tem horas lançadas", () => {
    expect(
      revenuePerHour([
        { revenue: 120_000, hours: 100 },
        { revenue: 30_000, hours: 50 },
        { revenue: 50_000, hours: 0 },
      ]),
    ).toBe(1_000);
    expect(revenuePerHour([{ revenue: 50_000, hours: 0 }])).toBeNull();
    expect(revenuePerHour([])).toBeNull();
  });

  it("resume grupos e receita por plano de contas, na ordem do SIOE", () => {
    const summary = planSummary([
      { revenue12m: 120_000, revenueByPlan: { "HONORÁRIOS MENSAIS": 120_000 } },
      { revenue12m: 60_000, revenueByPlan: { "HONORÁRIOS SPOT": 24_000, "HONORÁRIOS MENSAIS": 36_000 } },
      { revenue12m: 20_000, revenueByPlan: { "HONORÁRIOS DE ÊXITO": 20_000 } },
    ]);

    expect(summary.rows.map((r) => [r.plan, r.groups, r.revenue])).toEqual([
      ["HONORÁRIOS MENSAIS", 2, 156_000],
      ["HONORÁRIOS SPOT", 1, 24_000],
      ["HONORÁRIOS DE ÊXITO", 1, 20_000],
    ]);
    expect(summary.rows[0].revenueShare).toBeCloseTo(0.78);
    expect(summary.rows[0].avgMonthly).toBe(6_500);
    expect(planSummary([]).rows).toEqual([]);
  });

  it("usa o primeiro processo como porta de entrada e a pessoa jurídica do grupo", () => {
    const data = computeIcp(
      baseInput({
        revenue: [pay("Grupo Alfa", "Insolvência", 250_000)],
        processes: [
          { grupo: "Grupo Alfa", area: "Trabalhista", dataCadastro: "2025-05-01" },
          { grupo: "Grupo Alfa", area: "Cível | Insolvência", dataCadastro: "2025-02-01" },
        ],
        pessoas: [
          { grupo: "Grupo Alfa", tipo: "PESSOA JURÍDICA", uf: "SP", cidade: "Campinas", categoria: "Cliente ativo" },
          { grupo: "Grupo Alfa", tipo: "PESSOA FÍSICA", uf: "SP", cidade: "NÃO INFORMADA", categoria: "Contrário ativo" },
        ],
      })
    );

    const alfa = data.groups[0];
    expect(alfa.entryArea).toBe("Cível | Insolvência");
    expect(alfa.activeSince2025).toBe(true);
    expect(alfa.city).toBe("Campinas");
    expect(alfa.hasLegalEntity).toBe(true);
    // Sem CNPJ consultado, o grupo fica sem segmento e porte.
    expect(alfa.sectorBucket).toBeNull();
    expect(alfa.registeredSize).toBeNull();
    expect(data.entry.coreViaInsolvency).toBe(1);
    expect(data.newCore).toEqual({ total: 1, viaInsolvency: 1 });
    expect(data.geography.coreInterior).toBe(1);
  });

  it("calcula NPS, decisor e sinais de marketing", () => {
    const data = computeIcp(
      baseInput({
        nps: [
          { cargo: "Sócio(a) / Proprietário(a)", recommend: 10 },
          { cargo: "Financeiro", recommend: 9 },
          { cargo: null, recommend: 5 },
        ],
        npsThemes: [
          { id: "relacionamento", polarity: "strength" },
          { id: "disponibilidade", polarity: "pain" },
        ],
        linkedin: [
          { reportType: "followers", dimension: "industry", label: "Serviços advocatícios", value: 60 },
          { reportType: "followers", dimension: "industry", label: "Fabricação de produtos de material plástico", value: 10 },
          { reportType: "followers", dimension: "industry", label: "Bancos", value: 30 },
          { reportType: "followers", dimension: "seniority", label: "Diretor", value: 5 },
          { reportType: "followers", dimension: "seniority", label: "Sênior", value: 95 },
        ],
        whatsapp: [
          { leadSource: "meta_ads", pipelineStage: "lead_recebido" },
          { leadSource: null, pipelineStage: "qualificado" },
        ],
      })
    );

    expect(data.decisor.nps).toBe(33);
    expect(data.decisor.ownerResponses).toBe(1);
    expect(data.decisor.financeOrDirector).toBe(1);
    expect(data.decisor.strengths).toEqual([{ label: "Relacionamento", count: 1 }]);
    expect(data.marketing.linkedinLegalShare).toBeCloseTo(0.6);
    expect(data.marketing.linkedinIndustryShare).toBeCloseTo(0.1);
    expect(data.marketing.linkedinDecisionShare).toBeCloseTo(0.05);
    expect(data.marketing.whatsappUnqualified).toBe(1);
  });

  it("calcula custo de entrega, margem e atraso por área com o custo por hora de cada área", () => {
    const data = computeIcp(
      baseInput({
        revenue: [
          pay("Grupo Alfa", "Insolvência", 100_000),
          pay("Grupo Alfa", "Trabalhista", 20_000),
          pay("Grupo Beta", "Tributário", 30_000),
        ],
        personnelCost: [
          { departamento: "Insolvência", valor: 60_000 },
          { departamento: "Trabalhista", valor: 10_000 },
          { departamento: "Facilities", valor: 99_000 },
        ],
        hours: [
          { grupo: "Grupo Alfa", area: "Cível | Insolvência", horas: 400 },
          { grupo: "Grupo Área Insolvência", area: "Insolvência", horas: 200 },
          { grupo: "Grupo Alfa", area: "Trabalhista", horas: 100 },
          { grupo: "Grupo Alfa", area: "Trabalhista", horas: 100 },
          { grupo: "Grupo Beta", area: "Tributário", horas: 50 },
        ],
        overdue: [
          { grupo: "Grupo Alfa", departamento: "Insolvência", valor: 7_000 },
          { grupo: "Grupo Alfa", departamento: "Financeiro", valor: 1_000 },
        ],
      })
    );

    // Insolvência: 60 mil ÷ 600 h = R$ 100/h; Trabalhista: 10 mil ÷ 200 h = R$ 50/h.
    const rate = (area: string) => data.delivery.rates.find((r) => r.area === area);
    expect(rate("Insolvência")).toMatchObject({ rate: 100, fallback: false });
    expect(rate("Trabalhista")).toMatchObject({ rate: 50, fallback: false });
    // Tributário não tem custo próprio: usa a média (70 mil ÷ 800 h).
    expect(rate("Tributário")).toMatchObject({ rate: 87.5, fallback: true });
    expect(data.delivery.personnelCost).toBe(70_000);
    expect(data.delivery.hours).toBe(850);
    expect(data.delivery.clientHours).toBe(650);

    const alfa = data.groups.find((g) => g.grupo === "Grupo Alfa")!;
    expect(alfa.hours12m).toBe(600);
    expect(alfa.deliveryCost).toBe(50_000);
    expect(alfa.overdue).toBe(8_000);
    expect(alfa.areas).toEqual(["Insolvência", "Trabalhista"]);
    expect(alfa.byArea["Insolvência"]).toEqual({ revenue: 100_000, hours: 400, cost: 40_000, overdue: 7_000, folders: 0 });
    expect(alfa.byArea["Outros"]).toEqual({ revenue: 0, hours: 0, cost: 0, overdue: 1_000, folders: 0 });
  });

  it("marca grupos só de pessoa física e ignora lançamentos de centavos", () => {
    const data = computeIcp(
      baseInput({
        revenue: [pay("Grupo Física", "Cível", 5_000), pay("Grupo Empresa", "Cível", 5_000), pay("Grupo Centavos", "Cível", 0.01)],
        pessoas: [
          { grupo: "Grupo Física", tipo: "PESSOA FÍSICA", uf: "SP", cidade: "Campinas", categoria: "Cliente ativo" },
          { grupo: "Grupo Empresa", tipo: "PESSOA JURÍDICA", uf: "SP", cidade: "Campinas", categoria: "Cliente ativo" },
        ],
      })
    );
    const byName = new Map(data.groups.map((g) => [g.grupo, g]));
    expect(byName.get("Grupo Física")?.clientType).toBe("pessoa_fisica");
    expect(byName.get("Grupo Empresa")?.clientType).toBe("pessoa_juridica");
    expect(byName.has("Grupo Centavos")).toBe(false);
  });

  it("liga o porte do LinkedIn ao grupo pela faixa de colaboradores", () => {
    const profile = {
      grupo: "Grupo Spel",
      employeeRange: "51-200",
      employeeMin: 51,
      linkedinMembers: 57,
      linkedinUrl: "https://www.linkedin.com/company/spel-embalagens",
      linkedinName: "Spel Embalagens",
      website: "https://www.spel.com.br",
      logoUrl: "https://exemplo.supabase.co/logo.png",
      confidence: "alta" as const,
    };
    const data = computeIcp(
      baseInput({
        revenue: [pay("Grupo Spel", "Cível", 90_000), pay("Grupo Sem Página", "Cível", 90_000)],
        profiles: [profile],
      })
    );
    const byName = new Map(data.groups.map((g) => [g.grupo, g]));
    expect(byName.get("Grupo Spel")).toMatchObject({ employeeBand: "51a200", profile });
    expect(byName.get("Grupo Sem Página")).toMatchObject({ employeeBand: null, profile: null });
  });
});

describe("typicalEmployeeRange", () => {
  const groups = (spec: Record<string, number>) =>
    Object.entries(spec).flatMap(([band, n]) =>
      Array.from({ length: n }, () => ({ employeeBand: band as ReturnType<typeof employeeBandOf> }))
    );

  it("junta as faixas vizinhas que reúnem a maioria dos grupos", () => {
    expect(typicalEmployeeRange(groups({ ate10: 2, "11a50": 5, "51a200": 23, "201a500": 12, "500mais": 10 }))).toEqual({
      label: "De 51 a 500",
      count: 35,
      known: 52,
    });
  });

  it("usa uma faixa só quando ela já basta e trata as pontas", () => {
    expect(typicalEmployeeRange(groups({ "51a200": 8, "201a500": 2 }))?.label).toBe("De 51 a 200");
    expect(typicalEmployeeRange(groups({ "51a200": 2, "201a500": 4, "500mais": 4 }))?.label).toBe("Mais de 200");
    expect(typicalEmployeeRange(groups({ "201a500": 3, "500mais": 7 }))?.label).toBe("Mais de 500");
    expect(typicalEmployeeRange(groups({ ate10: 5, "11a50": 4, "500mais": 1 }))?.label).toBe("Até 50");
    expect(typicalEmployeeRange([{ employeeBand: null }])).toBeNull();
  });
});

describe("employeeBandOf", () => {
  it("agrupa as faixas do LinkedIn pelo mínimo de colaboradores", () => {
    expect(employeeBandOf(null)).toBeNull();
    expect(employeeBandOf(0)).toBe("ate10");
    expect(employeeBandOf(2)).toBe("ate10");
    expect(employeeBandOf(11)).toBe("11a50");
    expect(employeeBandOf(51)).toBe("51a200");
    expect(employeeBandOf(201)).toBe("201a500");
    expect(employeeBandOf(501)).toBe("500mais");
    expect(employeeBandOf(10_001)).toBe("500mais");
  });
});

describe("sizeBuckets", () => {
  const group = (grupo: string, revenue: number, area = "Cível") =>
    computeIcp(baseInput({ revenue: [pay(grupo, area, revenue)] })).groups[0];

  it("separa 10 maiores, 10 em volta da mediana e 10 menores sem repetir grupos", () => {
    const groups = Array.from({ length: 41 }, (_, i) => group(`G${i + 1}`, (41 - i) * 1_000));
    const [top, middle, bottom] = sizeBuckets(groups, null);
    expect(top.groups.map((g) => g.grupo)).toEqual(groups.slice(0, 10).map((g) => g.grupo));
    expect(bottom.groups.map((g) => g.grupo)).toEqual(groups.slice(31).map((g) => g.grupo));
    // Mediana = G21 (posição 20); os médios vão de G16 a G25.
    expect(middle.groups.map((g) => g.grupo)).toEqual(groups.slice(15, 25).map((g) => g.grupo));
    expect(top.revenue).toBe(groups.slice(0, 10).reduce((acc, g) => acc + g.revenue12m, 0));
    expect([top.rankFrom, top.rankTo]).toEqual([1, 10]);
    expect([middle.rankFrom, middle.rankTo]).toEqual([16, 25]);
    expect([bottom.rankFrom, bottom.rankTo]).toEqual([32, 41]);
    expect(middle.rankedTotal).toBe(41);
    expect(middle.medianRevenue).toBe(21_000);
  });

  it("filtra pela área e não repete grupos quando há poucos pagantes", () => {
    const groups = [group("A", 50_000), group("B", 40_000, "Trabalhista"), group("C", 30_000), group("D", 20_000)];
    const [top, middle, bottom] = sizeBuckets(groups, "Cível", 2);
    expect(top.groups.map((g) => g.grupo)).toEqual(["A", "C"]);
    expect(middle.groups).toEqual([]);
    expect(bottom.groups.map((g) => g.grupo)).toEqual(["D"]);
  });
});
