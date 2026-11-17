import { describe, expect, it } from "vitest";
import { summarizePipelineForDashboard, type DashboardLead } from "./dashboard-pipeline-summary";

const lead = (over: Partial<DashboardLead>): DashboardLead => ({
  etapa: "levantamento_dados",
  diasNaEtapa: 1,
  ...over,
});

describe("summarizePipelineForDashboard", () => {
  it("segue a ordem das colunas do kanban, não o volume", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "proposta_enviada" }),
      lead({ etapa: "proposta_enviada" }),
      lead({ etapa: "levantamento_dados" }),
    ]);
    expect(s.vendas.rows[0].stage).toBe("levantamento_dados");
    expect(s.vendas.rows.map((r) => r.stage).indexOf("proposta_enviada")).toBe(6);
    expect(s.vendas.total).toBe(3);
  });

  it("separa Vendas de Pós-venda e deixa o Cadastro do lead fora dos dois quadros", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "reuniao" }),
      lead({ etapa: "boas_vindas" }),
      lead({ etapa: "cadastro_lead" }),
    ]);
    expect(s.vendas.total).toBe(1);
    expect(s.posVenda.total).toBe(1);
  });

  it("tira o perdido do funil e conta à parte", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "reuniao", encerramento: "perdido", diasNaEtapa: 90 }),
      lead({ etapa: "reuniao" }),
    ]);
    expect(s.vendas.total).toBe(1);
    expect(s.perdidos).toBe(1);
    expect(s.atencao.parados.total).toBe(0);
  });

  it("em negociação conta só vendas em andamento, separando CRM e RD", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "reuniao" }),
      lead({ etapa: "proposta_enviada", origemRd: true }),
      lead({ etapa: "contrato_assinado" }),
      lead({ etapa: "boas_vindas" }),
    ]);
    expect(s.emNegociacao).toEqual({ total: 2, crm: 1, rd: 1 });
  });

  it("parado é o vermelho do semáforo da etapa; contrato assinado não conta", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "reuniao", diasNaEtapa: 9 }), // reunião: vermelho acima de 8
      lead({ etapa: "reuniao", diasNaEtapa: 5 }), // amarelo
      lead({ etapa: "contrato_assinado", diasNaEtapa: 400 }),
    ]);
    const reuniao = s.vendas.rows.find((r) => r.stage === "reuniao")!;
    expect(reuniao.parados).toBe(1);
    expect(reuniao.atencao).toBe(1);
    expect(s.atencao.parados).toEqual({ total: 1, pior: { title: "Reunião", dias: 9 } });
  });

  it("lead do RD parado conta à parte, sem entrar no vermelho (só consulta no CRM)", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "proposta_enviada", diasNaEtapa: 30, origemRd: true }),
      lead({ etapa: "boas_vindas", diasNaEtapa: 300, origemRd: true }),
      lead({ etapa: "proposta_enviada", diasNaEtapa: 1, origemRd: true }),
    ]);
    const proposta = s.vendas.rows.find((r) => r.stage === "proposta_enviada")!;
    expect(proposta).toMatchObject({ total: 2, rd: 2, parados: 0, paradosRd: 1 });
    expect(s.vendas.paradosRd).toBe(1);
    expect(s.posVenda.paradosRd).toBe(1);
    expect(s.atencao.parados.total).toBe(0);
    expect(s.atencao.rdSemMovimento).toBe(2);
  });

  it("conta assinatura pendente, due com ajuste aberto e migração do RD pendente", () => {
    const s = summarizePipelineForDashboard([
      lead({ etapa: "contrato_enviado" }),
      lead({
        etapa: "revisao",
        dueReviewAdjustments: [
          { areaKey: "civel", observacaoAjustes: "x", respondedAt: null, adjustmentCompletedAt: null },
        ],
      }),
      lead({
        etapa: "revisao",
        dueReviewAdjustments: [
          { areaKey: "civel", observacaoAjustes: "x", respondedAt: null, adjustmentCompletedAt: "2026-11-10" },
        ],
      }),
      lead({ etapa: "reuniao", rdMigracaoPendente: true }),
    ]);
    expect(s.atencao.aguardandoAssinatura).toBe(1);
    expect(s.atencao.dueComAjustes).toBe(1);
    expect(s.atencao.rdMigracaoPendente).toBe(1);
  });
});
