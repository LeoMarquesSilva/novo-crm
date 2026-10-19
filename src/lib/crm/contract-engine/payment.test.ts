import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { INVESTIMENTO_DOCUMENTO_KEY } from "@/data/proposta-tipos-catalog";
import { generateContratoDocxBuffer } from "@/lib/crm/generate-contrato-docx";
import { encodeParcelasList } from "@/lib/crm/proposta-investimento-parcelas";
import { buildCanonicalContract } from "./build-canonical";
import { SCOPE_IDS } from "./clause-catalog";
import { buildCanonicalContratoPage } from "./legacy-preview";
import { buildPaymentFromInvestment, detectPaymentMethod, paymentMethodDisplay } from "./payment";
import { createProposalContractSnapshot, resolveContractInvestment } from "./proposal-snapshot";

/** Investimento do teste E2E de 18/10/2026 (Renato Marotta Starek), como gravado na proposta. */
const SPOT_E2E = {
  id: "ab5477e3",
  tipoId: "honorarios_contratuais",
  subtipoId: "spot",
  placeholders: {
    VALORSPOT: "R$ 12.000,00",
    PARCELAS: "5",
    PARCELAS_IGUAIS: "sim",
    VALORPARCELA: "2.400,00",
    PARCELAS_VENCIMENTOS: encodeParcelasList([
      "na data de assinatura do Contrato",
      "30 dias após a 1ª parcela",
      "60 dias após a 1ª parcela",
      "90 dias após a 1ª parcela",
      "120 dias após a 1ª parcela",
    ]),
  },
  autoSum: false,
};
const MANUTENCAO_E2E = {
  id: "47fae558",
  tipoId: "honorarios_manutencao",
  subtipoId: "manutencao",
  placeholders: {
    VALORMANUTENCAO: "R$ 250,00",
    ITEM: "1",
    CONDICAOFINAL: "o encerramento dos procedimentos judiciais",
  },
  autoSum: false,
};
const EXITO_E2E = {
  id: "2c1fa052",
  tipoId: "honorarios_exito",
  subtipoId: "exito_percentual",
  placeholders: {
    PORCENTAGEMHONORARIOS: "5",
    BASECALCULO:
      "o proveito econômico obtido pelo Cliente, considerando o valor líquido reconhecido e recebido ao final do procedimento judicial",
  },
};

const CLAUSULA_3_E2E = [
  "Honorários fixos de R$ 12.000,00 (doze mil reais), pagos em cinco parcelas iguais de R$ 2.400,00 (dois mil e quatrocentos reais), vencendo a primeira na data de assinatura do Contrato, a segunda 30 dias após a 1ª parcela, a terceira 60 dias após a 1ª parcela, a quarta 90 dias após a 1ª parcela e a quinta 120 dias após a 1ª parcela.",
  "Após a quitação dos honorários fixos previstos nesta cláusula, será devido o valor mensal de R$ 250,00 (duzentos e cinquenta reais), a título de honorários de manutenção, até o encerramento dos procedimentos judiciais.",
  "Ficam previstos honorários de êxito de 5% (cinco por cento) sobre o proveito econômico obtido pelo Cliente, considerando o valor líquido reconhecido e recebido ao final do procedimento judicial.",
];

function escopoJson(items: unknown[]) {
  const first = items[0] as { tipoId: string; subtipoId: string; placeholders: Record<string, string> };
  return JSON.stringify({
    "Societário e Contratos": [
      {
        id: "21084555",
        tipoId: "diagnostico_e_reestruturacao_societaria",
        subtipoId: SCOPE_IDS.societarioDiagnostico,
        placeholders: { NOME_EMPRESA_OU_GRUPO: "TRINTA DO NOVE HOLDING LTDA." },
      },
    ],
    [INVESTIMENTO_DOCUMENTO_KEY]: {
      tipoId: first.tipoId,
      subtipoId: first.subtipoId,
      placeholders: first.placeholders,
      autoSum: false,
      items,
    },
  });
}

function investment(items: unknown[]) {
  return { ...resolveContractInvestment(escopoJson(items)), tributacao: "" };
}

function clause3(items: unknown[]) {
  return buildPaymentFromInvestment(investment(items)).clauseText.split("\n");
}

/** Texto dos parágrafos do DOCX (junta os runs de cada `<w:p>`). */
function docxParagraphs(buffer: Buffer): string[] {
  const xml = new PizZip(buffer).file("word/document.xml")?.asText() ?? "";
  return xml
    .split("</w:p>")
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    )
    .filter((t) => t.trim());
}

describe("cláusula 3 — cenário do teste E2E (SPOT 5x + manutenção + êxito 5%)", () => {
  it("monta um parágrafo por forma de honorário, sem perder vencimentos, manutenção ou êxito", () => {
    expect(clause3([SPOT_E2E, MANUTENCAO_E2E, EXITO_E2E])).toEqual(CLAUSULA_3_E2E);
  });

  it("total de parcela única ignora manutenção mensal e êxito", () => {
    const inv = investment([SPOT_E2E, MANUTENCAO_E2E, EXITO_E2E]);
    expect(inv.totalAmount).toBe(12000);
    expect(inv.totalExtenso).toBe("R$ 12.000,00 (doze mil reais)");
  });

  it("contrato gerado (DOCX) traz a cláusula 3 completa, sem 'indefinido' nem R$ 12.250", async () => {
    const result = buildCanonicalContract({
      snapshot: createProposalContractSnapshot({
        opportunityId: "opp-e2e",
        empresasIntake: [
          { index: 1, razao_social: "RENATO MAROTTA STAREK", tipo_documento: "CPF", documento: "529.982.247-25" },
        ],
        fieldByCode: {
          cp_proposta_empresas_json: JSON.stringify({ primaryIndex: 1, extras: [] }),
          cp_escopo_detalhe_json: escopoJson([SPOT_E2E, MANUTENCAO_E2E, EXITO_E2E]),
          cc_tipo_pagamento: "Personalizado",
        },
        capturedAt: "2026-10-18T15:00:00.000Z",
      }),
      generatedAt: new Date("2026-10-18T15:00:00.000Z"),
    });
    expect(result.data.payment.method).toBe("indefinido");
    expect(result.pendencias.find((p) => p.code === "investment")?.ok).toBe(true);

    const page = buildCanonicalContratoPage({ canonicalData: result.data });
    expect(page.tipoPagamento).toBe("");
    expect(page.investimento).toBe("R$ 12.000,00 (doze mil reais)");

    const paragraphs = docxParagraphs(await generateContratoDocxBuffer(page));
    const start = paragraphs.findIndex((p) => p.includes("DOS HONORÁRIOS CONTRATUAIS"));
    expect(start).toBeGreaterThan(0);
    expect(paragraphs.slice(start + 1, start + 5)).toEqual([
      ...CLAUSULA_3_E2E,
      "Proposta base: R$ 12.000,00 (doze mil reais).",
    ]);
    const all = paragraphs.join("\n");
    expect(all).not.toMatch(/indefinido/i);
    expect(all).not.toContain("12.250");
    expect(all).not.toContain("conforme condições da proposta");
  });
});

describe("cláusula 3 — SPOT", () => {
  it("parcelas iguais sem vencimento: mensais e sucessivas", () => {
    expect(
      clause3([
        { ...SPOT_E2E, placeholders: { VALORSPOT: "20.000,00", PARCELAS: "4", VALORPARCELA: "5.000,00" } },
      ]),
    ).toEqual([
      "Honorários fixos de R$ 20.000,00 (vinte mil reais), pagos em quatro parcelas mensais e sucessivas de R$ 5.000,00 (cinco mil reais) cada.",
    ]);
  });

  it("parcelas distintas com vencimento: soma confere e não acusa erro de aritmética", () => {
    const payment = buildPaymentFromInvestment(
      investment([
        {
          ...SPOT_E2E,
          placeholders: {
            VALORSPOT: "17.200,00",
            PARCELAS: "2",
            PARCELAS_IGUAIS: "nao",
            VALORPARCELA: "10.000,00",
            PARCELAS_VALORES: encodeParcelasList(["10.000,00", "7.200,00"]),
            PARCELAS_VENCIMENTOS: encodeParcelasList(["data de assinatura do Contrato", "10/12/2026"]),
          },
        },
      ]),
    );
    expect(payment.clauseText).toBe(
      "Honorários fixos de R$ 17.200,00 (dezessete mil e duzentos reais), pagos em duas parcelas, sendo a primeira no valor de R$ 10.000,00 (dez mil reais), vencível na data de assinatura do Contrato, e a segunda no valor de R$ 7.200,00 (sete mil e duzentos reais), vencível em 10/12/2026.",
    );
    expect(payment.arithmeticOk).toBe(true);
    expect(payment.installmentCount).toBe(2);
  });

  it("zero parcelas: à vista", () => {
    expect(clause3([{ ...SPOT_E2E, placeholders: { VALORSPOT: "8.000,00", PARCELAS: "0" } }])).toEqual([
      "Honorários fixos de R$ 8.000,00 (oito mil reais), para pagamento à vista.",
    ]);
  });

  it("SPOT + êxito não perde o êxito", () => {
    expect(
      clause3([
        {
          ...SPOT_E2E,
          tipoId: "honorarios_hibridos",
          subtipoId: "spot_mais_exito",
          placeholders: { VALORSPOT: "10.000,00", PORCENTAGEMHONORARIOS: "10", BASECALCULO: "o valor recuperado" },
        },
      ]),
    ).toEqual([
      "Honorários fixos de R$ 10.000,00 (dez mil reais). Acrescem-se honorários de êxito de 10% (dez por cento) sobre o valor recuperado, caso atingido o resultado previsto.",
    ]);
  });
});

describe("cláusula 3 — manutenção", () => {
  it("é mensal e usa ITEM/CONDICAOFINAL", () => {
    expect(clause3([SPOT_E2E, MANUTENCAO_E2E])[1]).toBe(CLAUSULA_3_E2E[1]);
  });

  it("sem item de referência nem condição final", () => {
    expect(
      clause3([{ ...MANUTENCAO_E2E, placeholders: { VALORMANUTENCAO: "1.500,00" } }]),
    ).toEqual(["Será devido o valor mensal de R$ 1.500,00 (mil e quinhentos reais), a título de honorários de manutenção."]);
  });

  it("item que não existe no contrato cita a proposta", () => {
    expect(
      clause3([{ ...MANUTENCAO_E2E, placeholders: { ...MANUTENCAO_E2E.placeholders, ITEM: "3" } }])[0],
    ).toMatch(/^Após a quitação dos honorários descritos no item 3 da proposta comercial, será devido/);
  });
});

describe("cláusula 3 — êxito", () => {
  it("Êxito % lê PORCENTAGEMHONORARIOS e BASECALCULO do catálogo", () => {
    expect(clause3([EXITO_E2E])).toEqual([CLAUSULA_3_E2E[2]]);
  });

  it("chave legada PERCENTUALEXITO continua aceita", () => {
    expect(clause3([{ ...EXITO_E2E, placeholders: { PERCENTUALEXITO: "8%" } }])).toEqual([
      "Ficam previstos honorários de êxito de 8% (oito por cento) sobre o proveito econômico obtido.",
    ]);
  });

  it("Êxito valor fixo usa VALOREXITO e PRAZOPAGAMENTO", () => {
    expect(
      clause3([
        {
          ...EXITO_E2E,
          subtipoId: "exito_valor_fixo",
          placeholders: { VALOREXITO: "30.000,00", PRAZOPAGAMENTO: "30 dias do trânsito em julgado" },
        },
      ]),
    ).toEqual([
      "Em caso de obtenção do resultado previsto, serão devidos honorários de êxito de R$ 30.000,00 (trinta mil reais), a serem pagos no prazo de 30 dias do trânsito em julgado.",
    ]);
  });

  it("êxito valor fixo não entra no total de parcela única", () => {
    const inv = investment([
      SPOT_E2E,
      { ...EXITO_E2E, subtipoId: "exito_valor_fixo", placeholders: { VALOREXITO: "30.000,00" } },
    ]);
    expect(inv.totalAmount).toBe(12000);
  });
});

describe("forma de pagamento", () => {
  it("fica indefinida quando a proposta não cita boleto, PIX ou transferência", () => {
    const payment = buildPaymentFromInvestment(investment([SPOT_E2E, MANUTENCAO_E2E, EXITO_E2E]), "Personalizado");
    expect(payment.method).toBe("indefinido");
    expect(paymentMethodDisplay(payment)).toBe("");
  });

  it("não confunde 'transferência de quotas' da base do êxito com forma de pagamento", () => {
    expect(
      detectPaymentMethod({ BASECALCULO: "o valor da transferência de quotas", PORCENTAGEMHONORARIOS: "5" }),
    ).toBe("indefinido");
  });

  it("detecta e rotula boleto/PIX citados no vencimento", () => {
    const payment = buildPaymentFromInvestment(
      investment([
        {
          ...SPOT_E2E,
          placeholders: {
            ...SPOT_E2E.placeholders,
            PARCELAS_VENCIMENTOS: encodeParcelasList(["via boleto na assinatura", "por PIX em 30 dias", "", "", ""]),
          },
        },
      ]),
    );
    expect(payment.method).toBe("combinado");
    expect(paymentMethodDisplay(payment)).toBe("boleto bancário ou PIX");
  });

  it("build antigo sem methodLabel continua com rótulo legível", () => {
    expect(paymentMethodDisplay({ method: "transferencia" })).toBe("transferência bancária");
    expect(paymentMethodDisplay({ method: "indefinido" })).toBe("");
  });
});
