import { describe, expect, it } from "vitest";
import { countInWindows, parseDashboardPeriod, periodDelta, periodWindow, saudacaoBr } from "./dashboard-period";
import { buildConversionFunnel, countActiveLeads } from "./dashboard-pipeline-summary";

describe("período do Dashboard", () => {
  it("aceita 7, 30 e 90 dias; o resto cai em 30", () => {
    expect(parseDashboardPeriod("7")).toBe(7);
    expect(parseDashboardPeriod(["90"])).toBe(90);
    expect(parseDashboardPeriod("15")).toBe(30);
    expect(parseDashboardPeriod(undefined)).toBe(30);
  });

  it("variação é das entradas contra o período anterior; sem base, não há percentual", () => {
    expect(periodDelta(12, 10)).toEqual({ atual: 12, anterior: 10, variacaoPct: 20 });
    expect(periodDelta(3, 0).variacaoPct).toBeNull();
  });

  it("conta cada data no período atual ou no anterior", () => {
    const agora = new Date("2026-11-17T12:00:00Z");
    const janela = periodWindow(7, agora);
    const d = countInWindows(
      ["2026-11-16T10:00:00Z", "2026-11-12T10:00:00Z", "2026-11-05T10:00:00Z", "2026-10-01T10:00:00Z", null],
      janela,
    );
    expect(d).toMatchObject({ atual: 2, anterior: 1 });
  });

  it("saúda pelo horário de Brasília (UTC−3)", () => {
    expect(saudacaoBr(new Date("2026-11-17T11:00:00Z"))).toBe("Bom dia"); // 08:00
    expect(saudacaoBr(new Date("2026-11-17T17:00:00Z"))).toBe("Boa tarde"); // 14:00
    expect(saudacaoBr(new Date("2026-11-17T23:30:00Z"))).toBe("Boa noite"); // 20:30
  });
});

describe("buildConversionFunnel", () => {
  type Lead = Parameters<typeof buildConversionFunnel>[0][number];
  const leads: Lead[] = [
    { etapa: "cadastro_lead" },
    { etapa: "cadastro_lead", encerramento: "perdido" },
    { etapa: "revisao" },
    { etapa: "reuniao", encerramento: "perdido" }, // sem due: do cadastro direto para a reunião
    { etapa: "proposta_enviada" },
    { etapa: "contrato_enviado", encerramento: "perdido" },
    { etapa: "contrato_assinado" },
    { etapa: "boas_vindas" }, // pós-venda: já fechou
    { etapa: "reuniao", encerramento: "ganho" }, // ganho marcado à mão conta até o fim
  ];
  const f = buildConversionFunnel(leads);
  const by = Object.fromEntries(f.phases.map((p) => [p.key, p]));

  it("cada lead conta em todas as fases até a etapa em que está ou foi perdido", () => {
    expect(f.phases.map((p) => p.chegaram)).toEqual([9, 7, 5, 5, 4, 3]);
    expect(f.total).toBe(9);
    expect(f.fechados).toBe(3);
    expect(f.conversaoPct).toBe(33);
  });

  it("taxa de passagem é da fase para a seguinte; a última não tem", () => {
    expect(by.entrada.passagemPct).toBe(78); // 7 de 9
    expect(by.fechado.passagemPct).toBeNull();
    expect(by.entrada.pctDoTotal).toBe(100);
  });

  it("perdido conta na fase em que estava", () => {
    expect(by.entrada.perdidos).toBe(1);
    expect(by.analise.perdidos).toBe(1);
    expect(by.contrato.perdidos).toBe(1);
    expect(by.fechado.perdidos).toBe(0);
  });

  it("oportunidades ativas = todas as etapas, sem as perdidas", () => {
    expect(countActiveLeads(leads)).toBe(6);
  });
});
