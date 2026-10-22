import { describe, expect, it } from "vitest";

import { buildDueWhatsappMessage } from "@/modules/crm/application/services/build-due-whatsapp-message";
import {
  buildEscopoPedidoValues,
  buildLevantamentoConcluidoValues,
  buildRevisaoInicioValues,
  buildRevisaoResultadoValues,
  decideReviewCycleResult,
  formatPrazoWhatsapp,
  type ReviewRow,
} from "./due-messages";
import { WHATSAPP_TEMPLATE_DEFS, renderWhatsappTemplate } from "./templates";

const LINK = "https://crm.example.com/crm/leads/1";
const render = (key: keyof typeof WHATSAPP_TEMPLATE_DEFS, values: Record<string, string | null | undefined>) =>
  renderWhatsappTemplate(WHATSAPP_TEMPLATE_DEFS[key].defaultBody, values);

describe("formatPrazoWhatsapp", () => {
  it("data e hora de Brasília, sem segundos", () => {
    expect(formatPrazoWhatsapp("2026-10-27T15:42:56.291Z")).toBe("27/10/2026 às 12:42");
    expect(formatPrazoWhatsapp(null)).toBe("");
  });
});

describe("revisão: início do ciclo", () => {
  it("uma mensagem com todas as áreas, o alerta de área sem responsável e o link", () => {
    const text = render(
      "due_revisao_inicio",
      buildRevisaoInicioValues({
        cliente: "LE BLOG CONFECÇÕES LTDA",
        ciclo: 1,
        prazoIso: "2026-10-27T15:42:56.291Z",
        revisores: [
          { area: "Cível", responsavel: "Giancarlo Zotini" },
          { area: "Recuperação de Créditos", responsavel: null },
        ],
        link: LINK,
      }),
    );
    expect(text).toBe(
      [
        "*DUE em revisão*",
        "*Cliente:* LE BLOG CONFECÇÕES LTDA",
        "*Ciclo:* 1",
        "*Prazo:* 27/10/2026 às 12:42",
        "",
        "*Revisores*",
        "• Cível: Giancarlo Zotini",
        "• Recuperação de Créditos: sem responsável",
        "",
        "*Atenção:* defina no cadastro de usuários quem revisa Recuperação de Créditos.",
        "",
        "Cada área aprova ou pede ajustes no CRM.",
        LINK,
      ].join("\n"),
    );
  });

  it("sem área faltando, sem alerta; link relativo some", () => {
    const text = render(
      "due_revisao_inicio",
      buildRevisaoInicioValues({
        cliente: "ACME",
        ciclo: 2,
        prazoIso: null,
        revisores: [{ area: "Cível", responsavel: "Ana" }],
        link: "/crm/leads/1",
      }),
    );
    expect(text).not.toContain("Atenção");
    expect(text).not.toContain("Prazo");
    expect(text).toContain("*Ciclo:* 2 (depois dos ajustes)");
    expect(text.endsWith("Cada área aprova ou pede ajustes no CRM.")).toBe(true);
  });
});

describe("revisão: quando mandar o resultado", () => {
  const row = (area: string, status: string, cycle = 1, extra: Partial<ReviewRow> = {}): ReviewRow => ({
    area_key: area,
    status,
    revision_cycle: cycle,
    ...extra,
  });

  it("aprovação no meio do ciclo não manda nada", () => {
    const rows = [row("Cível", "ok"), row("Trabalhista", "pendente")];
    expect(decideReviewCycleResult(rows, 1, { returnedToCompilacao: false })).toBeNull();
  });

  it("a última aprovação manda 'aprovada por todas'", () => {
    const rows = [row("Cível", "ok"), row("Trabalhista", "ok")];
    expect(decideReviewCycleResult(rows, 1, { returnedToCompilacao: false })?.kind).toBe("aprovada");
  });

  it("ciclo 2 aprovado considera quem já tinha aprovado no ciclo 1", () => {
    const rows = [
      row("Cível", "ok", 1),
      row("Trabalhista", "ajustes_solicitados", 1),
      row("Trabalhista", "ok", 2),
    ];
    const result = decideReviewCycleResult(rows, 2, { returnedToCompilacao: false });
    expect(result?.kind).toBe("aprovada");
    expect(result && result.kind === "aprovada" ? result.areas.map((r) => r.area_key) : []).toEqual([
      "Cível",
      "Trabalhista",
    ]);
  });

  it("pedido de ajuste que devolve para Compilação manda na hora, com aprovadas e sem resposta", () => {
    const rows = [
      row("Cível", "ok"),
      row("Trabalhista", "ajustes_solicitados", 1, { observacao_ajustes: "Valor zerado." }),
      row("Recuperação de Créditos", "pendente"),
    ];
    const result = decideReviewCycleResult(rows, 1, { returnedToCompilacao: true });
    expect(result).toMatchObject({ kind: "ajustes", aprovadas: ["Cível"], pendentes: ["Recuperação de Créditos"] });
    const text = render(
      "due_revisao_ajustes",
      buildRevisaoResultadoValues({ cliente: "ACME", ciclo: 1, result: result!, link: LINK }),
    );
    expect(text).toContain("• Trabalhista: Valor zerado.");
    expect(text).toContain("*Já aprovaram:* Cível");
    expect(text).toContain("*Sem resposta (voltam no próximo ciclo):* Recuperação de Créditos");
  });

  it("ajuste com a DUE já em Compilação e áreas sem resposta: não manda de novo", () => {
    const rows = [row("Cível", "ajustes_solicitados"), row("Trabalhista", "pendente")];
    expect(decideReviewCycleResult(rows, 1, { returnedToCompilacao: false })).toBeNull();
  });

  it("todas responderam com ajuste: manda ajustes, sem a linha de pendentes", () => {
    const rows = [row("Cível", "ok"), row("Trabalhista", "ajustes_solicitados")];
    const result = decideReviewCycleResult(rows, 1, { returnedToCompilacao: false });
    const text = render(
      "due_revisao_ajustes",
      buildRevisaoResultadoValues({ cliente: "ACME", ciclo: 1, result: result!, link: LINK }),
    );
    expect(text).toContain("• Trabalhista: ajuste pedido (sem observação)");
    expect(text).not.toContain("Sem resposta");
  });

  it("aprovada mostra quem aprovou", () => {
    const result = decideReviewCycleResult([row("Cível", "ok", 1, { respondido_por: "Ana" })], 1, {
      returnedToCompilacao: false,
    });
    const text = render(
      "due_revisao_aprovada",
      buildRevisaoResultadoValues({ cliente: "ACME", ciclo: 1, result: result!, link: LINK }),
    );
    expect(text).toContain("• Cível: aprovada por Ana");
    expect(text).toContain("*Próximo passo:*");
  });
});

describe("levantamento concluído e escopo", () => {
  it("lista o que cada área entregou", () => {
    const text = render(
      "due_levantamento_concluido",
      buildLevantamentoConcluidoValues({
        cliente: "ACME",
        entregas: [
          { area: "Cível", semProcessosAtivos: false, planilhas: ["civel.xlsx"] },
          { area: "Reestruturação e Insolvência", semProcessosAtivos: false, planilhas: [] },
          { area: "Tributário", semProcessosAtivos: true, planilhas: [] },
        ],
        link: LINK,
      }),
    );
    expect(text).toContain("• Cível: planilha anexada");
    expect(text).toContain("• Reestruturação e Insolvência: pasta Due Diligence confirmada");
    expect(text).toContain("• Tributário: sem processos ativos");
  });

  it("escopo: uma linha por área, com o gestor ou o aviso de sem gestor", () => {
    const text = render(
      "proposta_escopo_pedido",
      buildEscopoPedidoValues({
        cliente: "ACME",
        prazoIso: "2026-10-25T15:55:39.476Z",
        areas: [
          { area: "Reestruturação e Insolvência", gestores: ["Lavinia Ferraz Crispim"] },
          { area: "Cível", gestores: [] },
        ],
        link: LINK,
      }),
    );
    expect(text).toContain("*Prazo:* 25/10/2026 às 12:55");
    expect(text).toContain("• Reestruturação e Insolvência: Lavinia Ferraz Crispim");
    expect(text).toContain("• Cível: sem gestor na área");
  });
});

describe("novo lead com DUE", () => {
  it("o texto padrão continua igual ao de antes (sem a linha de avisos vazia)", () => {
    const text = buildDueWhatsappMessage({
      solicitante: "Ana",
      cadastrado_por: "ana@x.com",
      email: "ana@x.com",
      due_diligence: "Sim",
      data_entrega_due: "2026-10-26",
      horario_entrega_due: "18:00",
      empresas: [{ tipo_documento: "CNPJ", razao_social: "ACME", documento: "00.000.000/0001-00" }],
      areas_analise: ["Cível"],
      local_reuniao: "A definir",
      data_reuniao: "2026-10-27",
      horario_reuniao: "12:00",
      tipo_de_lead: "Lead Ativa",
      contexto_comercial: null,
      razao_social_completa: "ACME",
      cnpj_completo: "00.000.000/0001-00",
    } as never);
    expect(text).toContain("*Due Diligence:* Sim\n\n_Esta mensagem foi gerada automaticamente");
    expect(text).toContain("- *Prazo de Entrega:* 26/10/2026 às 18:00");
  });
});
