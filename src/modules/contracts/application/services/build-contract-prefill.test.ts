import { describe, expect, it } from "vitest";

import { renatoProposalEscopoJson as renatoProposal } from "@/lib/crm/contract-inclusion/fixtures/renato-e2e";

import { moneyCents } from "../../domain/money";
import { buildContractPrefill } from "./build-contract-prefill";

const ingenvityProposal = JSON.stringify({
  Trabalhista: [
    {
      id: "labor-1",
      tipoId: "assessoria_trabalhista",
      subtipoId: "contencioso",
      placeholders: {
        QTD_PROCESSOS: "20",
        HORAS_MES: "12",
        VALOR_EXCEDENTE_PROCESSO: "",
        VALOR_EXCEDENTE_HORA: "",
      },
      investimento: {
        tipoId: "honorarios_contratuais",
        subtipoId: "mensal_fixo",
        placeholders: { VALORMENSAL: "14.600,00" },
      },
    },
  ],
  "Societario e Contratos": [
    {
      id: "contracts-1",
      tipoId: "assessoria_contratual",
      subtipoId: "consultivo",
      placeholders: { HORAS_MES: "6" },
      investimento: {
        tipoId: "honorarios_contratuais",
        subtipoId: "spot",
        placeholders: {
          VALORSPOT: "12.000,00",
          PARCELAS: "2",
          PARCELAS_IGUAIS: "nao",
          PARCELAS_VALORES: "7.000,00|5.000,00",
          PARCELAS_VENCIMENTOS: "na assinatura|30 dias depois",
        },
      },
    },
  ],
});

const rdDetails = {
  deal: {
    deal_custom_fields: [
      {
        custom_field: { label: "Início da Vigência do Contrato [FINANCEIRO]" },
        value: "2026-10-01",
      },
      {
        custom_field: { label: "Primeiro Faturamento [FINANCEIRO]" },
        value: "2026-10-10",
      },
      {
        custom_field: { label: "SPOT - Valor R$  [CC]" },
        value: "9.000,00",
      },
      {
        custom_field: { label: "Êxito - Valor R$  [CC]" },
        value: "25.000,00",
      },
      {
        custom_field: { label: "RATEIO - PORCENTAGEM %  (Trabalhista) - [CC] " },
        value: "40",
      },
    ],
  },
};

describe("buildContractPrefill", () => {
  it("applies draft, field-values, CRM override and latest reconciliation precedence per field", () => {
    const result = buildContractPrefill({
      existingDraft: {
        fields: { vigencia_contrato_financeiro: "2026-07-01" },
      },
      fieldValues: {
        primeiro_faturamento_financeiro: "2026-08-10",
      },
      crmRdFieldOverrides: {
        vigencia_contrato_financeiro: "2026-09-01",
        primeiro_faturamento_financeiro: "2026-09-10",
        razao_social_financeiro: "Cliente pelo override",
      },
      latestReconciliationDetails: rdDetails,
    });

    expect(result.fields.vigencia_contrato_financeiro).toEqual({
      value: "2026-07-01",
      source: "contrato",
      requiresConfirmation: true,
    });
    expect(result.fields.primeiro_faturamento_financeiro).toEqual({
      value: "2026-08-10",
      source: "proposta",
      requiresConfirmation: true,
    });
    expect(result.fields.razao_social_financeiro).toEqual({
      value: "Cliente pelo override",
      source: "manual",
      requiresConfirmation: true,
    });
    expect(result.fields.exito_financeiro).toEqual({
      value: "25.000,00",
      source: "rd",
      requiresConfirmation: true,
    });
  });

  it("extracts normalized Ingevity-style areas and proposal components without inventing empty rates", () => {
    const result = buildContractPrefill({
      fieldValues: {
        cp_escopo_detalhe_json: ingenvityProposal,
        cc_civel_limite_processos: "2",
        cc_civel_horas_consultivas: "8",
      },
    });

    expect(result.areas).toEqual([
      {
        value: {
          areaKey: "Trabalhista",
          includedProcesses: 20,
          includedHours: 12,
          processExcessRateCents: null,
          hourExcessRateCents: null,
        },
        source: "proposta",
        requiresConfirmation: true,
      },
      {
        value: {
          areaKey: "Societário e Contratos",
          includedProcesses: null,
          includedHours: 6,
          processExcessRateCents: null,
          hourExcessRateCents: null,
        },
        source: "proposta",
        requiresConfirmation: true,
      },
      {
        value: {
          areaKey: "Cível",
          includedProcesses: 2,
          includedHours: 8,
          processExcessRateCents: null,
          hourExcessRateCents: null,
        },
        source: "contrato",
        requiresConfirmation: true,
      },
    ]);

    expect(result.billingComponents).toEqual([
      expect.objectContaining({
        source: "proposta",
        requiresConfirmation: true,
        value: expect.objectContaining({
          kind: "mensal_fixo",
          areaKey: "Trabalhista",
          amountCents: moneyCents(BigInt(1_460_000)),
          requiresManualRelease: false,
        }),
      }),
      expect.objectContaining({
        source: "proposta",
        requiresConfirmation: true,
        value: expect.objectContaining({
          kind: "mensal_preco_fechado",
          areaKey: "Societário e Contratos",
          amountCents: moneyCents(BigInt(1_200_000)),
          requiresManualRelease: false,
          installments: [
            { number: 1, amountCents: moneyCents(BigInt(700_000)), dueCondition: "na assinatura", dueDate: null },
            { number: 2, amountCents: moneyCents(BigInt(500_000)), dueCondition: "30 dias depois", dueDate: null },
          ],
        }),
      }),
    ]);
  });

  it("maps current RD finance component and area-allocation keys without activating them", () => {
    const result = buildContractPrefill({
      crmRdFieldOverrides: {
        mensal_fixo_financeiro: "18.000,00",
        spot_financeiro: "",
        rateio_valor_civel_financeiro: "10.000,00",
      },
      latestReconciliationDetails: rdDetails,
    });

    expect(result.billingComponents).toEqual([
      {
        value: {
          key: "mensal_fixo_financeiro",
          kind: "mensal_fixo",
          description: "Mensal – Fixo Valor R$ [CC]",
          amountCents: moneyCents(BigInt(1_800_000)),
          requiresManualRelease: false,
        },
        source: "manual",
        requiresConfirmation: true,
      },
      {
        value: {
          key: "exito_financeiro",
          kind: "exito_valor_fixo",
          description: "Êxito - Valor R$ [CC]",
          amountCents: moneyCents(BigInt(2_500_000)),
          requiresManualRelease: true,
        },
        source: "rd",
        requiresConfirmation: true,
      },
    ]);
    expect(result.areaAllocations).toEqual([
      {
        value: { areaKey: "Cível", mode: "valor", amountCents: moneyCents(BigInt(1_000_000)) },
        source: "manual",
        requiresConfirmation: true,
      },
      {
        value: { areaKey: "Trabalhista", mode: "percentual", percentageBasisPoints: 4_000 },
        source: "rd",
        requiresConfirmation: true,
      },
    ]);
    expect(result.fields.spot_financeiro).toBeUndefined();
  });

  it("keeps proposal monthly and spot components once when lower-priority finance sources repeat them", () => {
    const result = buildContractPrefill({
      fieldValues: { cp_escopo_detalhe_json: ingenvityProposal },
      crmRdFieldOverrides: {
        mensal_fixo_financeiro: "18.000,00",
        spot_financeiro: "15.000,00",
      },
      latestReconciliationDetails: rdDetails,
    });

    expect(
      result.billingComponents
        .filter(({ value }) => ["mensal_fixo", "spot", "mensal_preco_fechado"].includes(value.kind))
        .map(({ value, source }) => ({ kind: value.kind, amountCents: value.amountCents, source })),
    ).toEqual([
      { kind: "mensal_fixo", amountCents: moneyCents(BigInt(1_460_000)), source: "proposta" },
      { kind: "mensal_preco_fechado", amountCents: moneyCents(BigInt(1_200_000)), source: "proposta" },
    ]);
  });

  it("parses a BRL integer with a thousands dot as eighteen thousand reais", () => {
    const result = buildContractPrefill({
      crmRdFieldOverrides: { mensal_fixo_financeiro: "18.000" },
    });

    expect(result.billingComponents[0]?.value.amountCents).toBe(moneyCents(BigInt(1_800_000)));
  });

  it.each([
    ["0.5", 50],
    ["0,5", 50],
  ] as const)("parses percentage decimal %s without treating it as a thousands value", (raw, want) => {
    const result = buildContractPrefill({
      crmRdFieldOverrides: { rateio_porcentagem_civel_financeiro: raw },
    });

    expect(result.areaAllocations[0]?.value).toEqual({
      areaKey: "Cível",
      mode: "percentual",
      percentageBasisPoints: want,
    });
  });

  it("preserves an already-deserialized proposal object stored in value_json", () => {
    const result = buildContractPrefill({
      fieldValues: [
        {
          field_code: "cp_escopo_detalhe_json",
          value_json: JSON.parse(ingenvityProposal),
        },
      ],
    });

    expect(result.areas.map(({ value }) => value.areaKey)).toEqual([
      "Trabalhista",
      "Societário e Contratos",
    ]);
    expect(result.billingComponents.map(({ value }) => value.kind)).toEqual([
      "mensal_fixo",
      "mensal_preco_fechado",
    ]);
  });

  it("completa manutenção e êxito pelo investimento consolidado da proposta (teste E2E 18/10/2026)", () => {
    const result = buildContractPrefill({ fieldValues: { cp_escopo_detalhe_json: renatoProposal } });
    expect(result.billingComponents.map(({ value }) => value)).toEqual([
      expect.objectContaining({
        kind: "mensal_preco_fechado",
        areaKey: "Societário e Contratos",
        amountCents: moneyCents(BigInt(1_200_000)),
        requiresManualRelease: false,
        installments: [
          { number: 1, amountCents: moneyCents(BigInt(240_000)), dueCondition: "na data de assinatura do Contrato", dueDate: null },
          { number: 2, amountCents: moneyCents(BigInt(240_000)), dueCondition: "20/11/2026", dueDate: "2026-11-20" },
          { number: 3, amountCents: moneyCents(BigInt(240_000)), dueCondition: "20/12/2026", dueDate: "2026-12-20" },
          { number: 4, amountCents: moneyCents(BigInt(240_000)), dueCondition: "20/01/2027", dueDate: "2027-01-20" },
          { number: 5, amountCents: moneyCents(BigInt(240_000)), dueCondition: "20/02/2027", dueDate: "2027-02-20" },
        ],
      }),
      expect.objectContaining({
        kind: "manutencao",
        areaKey: "Societário e Contratos",
        amountCents: moneyCents(BigInt(25_000)),
        requiresManualRelease: false,
      }),
      expect.objectContaining({
        kind: "exito_percentual",
        areaKey: "Societário e Contratos",
        percentageBasisPoints: 500,
        requiresManualRelease: true,
      }),
    ]);
  });

  it("SPOT condicionado continua gatilho e híbridos viram dois componentes", () => {
    const proposal = JSON.stringify({
      Cível: [
        {
          id: "c1",
          tipoId: "contencioso",
          subtipoId: "um_processo",
          investimento: {
            tipoId: "honorarios_hibridos",
            subtipoId: "mensal_mais_exito",
            placeholders: { VALORMENSAL: "3.000,00", PORCENTAGEMHONORARIOS: "10" },
          },
        },
        {
          id: "c2",
          tipoId: "contencioso",
          subtipoId: "um_processo",
          investimento: {
            tipoId: "honorarios_contratuais",
            subtipoId: "spot_condicionado",
            placeholders: { VALORSPOT: "5.000,00", PARCELAS: "2", VALORPARCELA: "2.500,00" },
          },
        },
      ],
    });
    const kinds = buildContractPrefill({ fieldValues: { cp_escopo_detalhe_json: proposal } }).billingComponents.map(
      ({ value }) => [value.kind, value.requiresManualRelease],
    );
    expect(kinds).toEqual([
      ["mensal_fixo", false],
      ["exito_percentual", true],
      ["spot", true],
    ]);
  });
});
