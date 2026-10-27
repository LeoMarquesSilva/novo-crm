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
    focal: { name: null, email: null, phone: null },
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
    expect(p.financeiro.faturamento).toEqual({ tipo: "CNPJ", razaoSocial: "ACME", documento: "12345678000190" });
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

  it("vencimento em texto livre da proposta não vira data (teste E2E 18/10/2026)", () => {
    const p = buildClientOnboardingPrefill(
      sources({ payment: { firstDueDate: "na data de vencimento a combinar" }, signedOn: "2026-10-18" }),
    );
    expect(p.financeiro.primeiroFaturamento).toBe("");
    expect(p.sources["financeiro.primeiroFaturamento"]).toBeUndefined();
  });

  it("vencimento na assinatura usa a data em que a venda fechou; data escrita no texto é lida", () => {
    const naAssinatura = buildClientOnboardingPrefill(
      sources({ payment: { firstDueDate: "na data de assinatura do Contrato" }, signedOn: "2026-10-18" }),
    );
    expect(naAssinatura.financeiro.primeiroFaturamento).toBe("2026-10-18");
    expect(naAssinatura.sources["financeiro.primeiroFaturamento"]).toBe("assinatura");

    const semAssinatura = buildClientOnboardingPrefill(
      sources({ payment: { firstDueDate: "na data de assinatura do Contrato" } }),
    );
    expect(semAssinatura.financeiro.primeiroFaturamento).toBe("");

    const escrita = buildClientOnboardingPrefill(sources({ payment: { firstDueDate: "na data de 20/10/2026" } }));
    expect(escrita.financeiro.primeiroFaturamento).toBe("2026-10-20");
    expect(escrita.sources["financeiro.primeiroFaturamento"]).toBe("contrato");
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
    const focalOnly = buildClientOnboardingPrefill(
      sources({ focal: { name: "Ana", email: "ana@acme.com", phone: "(19) 98215-2220" } }),
    );
    expect(focalOnly.financeiro.contatoFinanceiro).toMatchObject({ email: "ana@acme.com", telefone: "(19) 98215-2220" });
    expect(focalOnly.sources["financeiro.contatoFinanceiro"]).toBe("ponto_focal");

    const withContact = buildClientOnboardingPrefill(
      sources({
        focal: { name: "Ana", email: "ana@acme.com", phone: null },
        contatoFinanceiro: { nome: "Bruno", cargo: "Financeiro", email: "fin@acme.com", telefone: null },
      }),
    );
    expect(withContact.financeiro.contatoFinanceiro).toMatchObject({ nome: "Bruno", email: "fin@acme.com" });
  });

  it("e-mail e telefone do cliente vêm do ponto focal quando a carteira não tem", () => {
    const focal = { name: "Ana", email: "ana@acme.com", phone: "(19) 98215-2220" };
    const fromFocal = buildClientOnboardingPrefill(sources({ focal }));
    expect(fromFocal.cadastro).toMatchObject({ email: "ana@acme.com", telefone: "(19) 98215-2220" });
    expect(fromFocal.sources["cadastro.email"]).toBe("ponto_focal");
    expect(fromFocal.sources["cadastro.telefone"]).toBe("ponto_focal");

    const fromCarteira = buildClientOnboardingPrefill(
      sources({
        focal,
        cliente: { razaoSocial: "ACME", documento: null, endereco: null, email: "contato@acme.com", telefone: null },
      }),
    );
    expect(fromCarteira.cadastro).toMatchObject({ email: "contato@acme.com", telefone: "(19) 98215-2220" });
    expect(fromCarteira.sources["cadastro.email"]).toBe("carteira");
    expect(fromCarteira.sources["cadastro.telefone"]).toBe("ponto_focal");
  });
});
