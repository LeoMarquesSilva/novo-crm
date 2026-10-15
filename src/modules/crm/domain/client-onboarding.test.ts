import { describe, expect, it } from "vitest";

import {
  emptyClientOnboardingPayload,
  listMissingChecklistItems,
  listMissingOnboardingFields,
  parseClientOnboardingPayload,
  parseOpsChecklist,
} from "./client-onboarding";

function complete() {
  const p = emptyClientOnboardingPayload();
  p.cadastro.razaoSocial = "ACME S.A.";
  p.cadastro.documento = "12.345.678/0001-90";
  p.cadastro.endereco = {
    cep: "13010-000",
    logradouro: "Rua A",
    numero: "10",
    complemento: "",
    bairro: "Centro",
    cidade: "Campinas",
    uf: "SP",
  };
  p.financeiro.faturamento = { razaoSocial: "ACME S.A.", documento: "12345678000190" };
  p.financeiro.inicioVigencia = "2026-10-15";
  p.financeiro.primeiroFaturamento = "2026-11-10";
  p.financeiro.contatoFinanceiro = { nome: "Ana", posicao: "CFO", email: "ana@acme.com", telefone: "" };
  p.financeiro.reajuste = { indice: "IPCA", periodicidadeMeses: "12" };
  return p;
}

describe("client onboarding", () => {
  it("rascunho vazio lista os obrigatórios", () => {
    const missing = listMissingOnboardingFields(emptyClientOnboardingPayload());
    expect(missing).toContain("Razão social do cliente");
    expect(missing).toContain("Início da vigência");
    expect(missing).toContain("E-mail do contato financeiro");
  });

  it("cadastro completo não tem pendências", () => {
    expect(listMissingOnboardingFields(complete())).toEqual([]);
  });

  it("primeiro faturamento condicionado exige a condição", () => {
    const p = complete();
    p.financeiro.primeiroFaturamento = "";
    p.financeiro.primeiroFaturamentoCondicionado = true;
    expect(listMissingOnboardingFields(p)).toEqual(["Condição do primeiro faturamento"]);
  });

  it("rateio precisa somar 100%", () => {
    const p = complete();
    p.financeiro.rateioPorArea = [
      { area: "Cível", percentual: "60" },
      { area: "Trabalhista", percentual: "30" },
    ];
    expect(listMissingOnboardingFields(p)).toEqual(["Rateio por área somando 100%"]);
    p.financeiro.rateioPorArea[1]!.percentual = "40";
    expect(listMissingOnboardingFields(p)).toEqual([]);
  });

  it("payload inválido vira rascunho vazio sem quebrar", () => {
    expect(parseClientOnboardingPayload({ cadastro: { razaoSocial: 123 } }).cadastro.razaoSocial).toBe("");
    expect(parseClientOnboardingPayload(null).financeiro.rateioPorArea).toEqual([]);
  });

  it("checklist de Operações Legais", () => {
    const checklist = parseOpsChecklist({ dadosConferidos: true, viosCadastrado: true });
    expect(listMissingChecklistItems(checklist)).toEqual([
      "Código do cliente no VIOS",
      "Sistemas legados atualizados",
      "Nome do grupo econômico",
    ]);
  });
});
