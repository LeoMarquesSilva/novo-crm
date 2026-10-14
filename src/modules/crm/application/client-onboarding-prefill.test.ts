import { describe, expect, it } from "vitest";

import { buildClientOnboardingPrefill, type OnboardingPrefillSources } from "./client-onboarding-prefill";

const address = {
  logradouro: "Av. Brasil",
  numero: "100",
  complemento: "",
  bairro: "Centro",
  cidade: "Campinas",
  uf: "sp",
  cep: "13010-000",
};

function sources(patch: Partial<OnboardingPrefillSources> = {}): OnboardingPrefillSources {
  return {
    contractParties: null,
    intakeParties: [],
    proposalAddress: null,
    startRule: null,
    payment: null,
    signedOn: null,
    areaAmounts: [],
    focal: { name: null, email: null },
    cliente: null,
    contatoFinanceiro: null,
    ...patch,
  };
}

const party = (razaoSocial: string, documento: string, role: "contratante" | "relacionada" = "contratante") => ({
  id: razaoSocial,
  razaoSocial,
  documento,
  documentoTipo: "CNPJ" as const,
  endereco: address,
  role,
  source: "intake" as const,
});

describe("buildClientOnboardingPrefill", () => {
  it("usa as partes do contrato, o endereço e as datas do contrato", () => {
    const p = buildClientOnboardingPrefill(
      sources({
        contractParties: [party("ACME", "12345678000190"), party("ACME Filial", "12345678000270", "relacionada")],
        startRule: { kind: "on_defined_date", date: "2026-11-01" },
        payment: { firstDueDate: "2026-11-10" },
      }),
    );
    expect(p.cadastro.razaoSocial).toBe("ACME");
    expect(p.cadastro.endereco).toMatchObject({ cep: "13010000", uf: "SP" });
    expect(p.cadastro.empresasConsulta).toHaveLength(2);
    expect(p.financeiro.faturamento).toEqual({ razaoSocial: "ACME", documento: "12345678000190" });
    expect(p.financeiro.inicioVigencia).toBe("2026-11-01");
    expect(p.financeiro.primeiroFaturamento).toBe("2026-11-10");
    expect(p.sources["cadastro.razaoSocial"]).toBe("contrato");
  });

  it("vigência na assinatura usa a data em que a venda fechou", () => {
    const p = buildClientOnboardingPrefill(
      sources({ startRule: { kind: "on_signature" }, signedOn: "2026-10-14" }),
    );
    expect(p.financeiro.inicioVigencia).toBe("2026-10-14");
    expect(p.sources["financeiro.inicioVigencia"]).toBe("assinatura");
  });

  it("rateio proporcional aos valores das áreas da proposta", () => {
    const p = buildClientOnboardingPrefill(
      sources({
        areaAmounts: [
          { area: "Cível", amount: 3000 },
          { area: "Trabalhista", amount: 1000 },
        ],
      }),
    );
    expect(p.financeiro.rateioPorArea).toEqual([
      { area: "Cível", percentual: "75" },
      { area: "Trabalhista", percentual: "25" },
    ]);
  });

  it("ponto focal vira sugestão de contato financeiro, contato da carteira prevalece", () => {
    const focalOnly = buildClientOnboardingPrefill(sources({ focal: { name: "Ana", email: "ana@acme.com" } }));
    expect(focalOnly.financeiro.contatoFinanceiro.email).toBe("ana@acme.com");
    expect(focalOnly.sources["financeiro.contatoFinanceiro"]).toBe("ponto_focal");

    const withContact = buildClientOnboardingPrefill(
      sources({
        focal: { name: "Ana", email: "ana@acme.com" },
        contatoFinanceiro: { nome: "Bruno", cargo: "Financeiro", email: "fin@acme.com", telefone: null },
      }),
    );
    expect(withContact.financeiro.contatoFinanceiro).toMatchObject({ nome: "Bruno", email: "fin@acme.com" });
  });
});
