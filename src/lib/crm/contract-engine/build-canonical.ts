import { resolveContractClauses } from "./clause-engine";
import { getContractedFirm } from "./firm-party";
import { formatContractCityDate, toSaoPauloIso } from "./local-date";
import { resolveContractObject } from "./object-engine";
import { contractPartyGrammar } from "./party-language";
import { buildPaymentFromInvestment } from "./payment";
import {
  applyScopeAdjustments,
  resolveContractingParties,
  resolveContractInvestment,
  resolveContractScopes,
  type ProposalContractSnapshot,
} from "./proposal-snapshot";
import { mergeStartRules, mergeTermRules, renderStartText, renderTermText } from "./term";
import type {
  CanonicalContractBuildResult,
  ContractClauseTemplate,
  ContractEngineEvent,
  ContractEnginePendencia,
  ContractObjectOverride,
  ContractOverride,
  ContractScopeAdjustment,
} from "./types";
import { validateProposalContractAlignment } from "./alignment";
import { listForbiddenDraftTokens, listUnresolvedPlaceholders } from "./placeholders";

export function buildCanonicalContract(input: {
  snapshot: ProposalContractSnapshot;
  generatedAt?: Date;
  overrides?: ContractOverride[];
  objectFieldValues?: Record<string, string>;
  objectOverrides?: ContractObjectOverride[];
  scopeAdjustment?: ContractScopeAdjustment | null;
  explicitCompositionKey?: string | null;
  fieldByCode?: Record<string, string>;
  engineEvents?: ContractEngineEvent[];
  /** Biblioteca de cláusulas carregada do banco (admin de cláusulas). */
  clauseLibrary?: Map<string, ContractClauseTemplate>;
}): CanonicalContractBuildResult {
  const generatedAt = input.generatedAt ?? new Date();
  const firm = getContractedFirm();
  const scopes = applyScopeAdjustments(
    resolveContractScopes(input.snapshot.escopoJson),
    input.scopeAdjustment,
  );
  const investment = {
    ...resolveContractInvestment(input.snapshot.escopoJson),
    tributacao: input.snapshot.tributacao,
  };
  const payment = buildPaymentFromInvestment(investment, input.snapshot.ccTipoPagamento);
  const parties = resolveContractingParties({
    empresasIntake: input.snapshot.empresasIntake,
    propostaEmpresasJson: input.snapshot.propostaEmpresasJson,
    address: input.snapshot.address,
  });
  const contratantes = parties.filter((p) => p.role === "contratante");
  const grammar = contractPartyGrammar(contratantes.length);
  const term = mergeTermRules(
    scopes.map((s) => s.profile?.defaultTermRule).filter((r): r is NonNullable<typeof r> => Boolean(r)),
  );
  const startRule = mergeStartRules(
    scopes.map((s) => s.profile?.defaultStartRule).filter((r): r is NonNullable<typeof r> => Boolean(r)),
  );
  const contractObject = resolveContractObject({
    scopes,
    grammar,
    fieldByCode: input.fieldByCode,
    manualFields: input.objectFieldValues,
    overrides: input.objectOverrides,
    explicitCompositionKey: input.explicitCompositionKey,
  });
  const { clauses, sections } = resolveContractClauses({
    scopes,
    payment,
    grammar,
    vigenciaTexto: renderTermText(term),
    inicioTexto: renderStartText(startRule),
    tributacao: investment.tributacao,
    firmPlaceholders: {
      "[BANCO]": firm.bank.banco,
      "[AGENCIA]": firm.bank.agencia,
      "[CONTA]": firm.bank.conta,
      "[TITULAR]": firm.bank.titular,
      "[CNPJ_FIRMA]": firm.bank.cnpj,
      "[PIX_FIRMA]": firm.bank.pix,
    },
    contractObject,
    clauseLibrary: input.clauseLibrary,
  });

  const data = {
    opportunityId: input.snapshot.opportunityId,
    proposalSnapshotId: input.snapshot.snapshotId,
    contractingParties: contratantes,
    contractedFirm: firm,
    scopes,
    investment,
    payment,
    term,
    startRule,
    clauses,
    sections,
    signers: firm.representatives,
    generation: {
      city: firm.cidade,
      generatedAt: toSaoPauloIso(generatedAt),
      localDateLabel: formatContractCityDate(generatedAt, firm.cidade),
    },
    overrides: input.overrides ?? [],
    contractObject,
    scopeAdjustment: input.scopeAdjustment ?? null,
    engineEvents: input.engineEvents ?? [],
  };

  const alignment = validateProposalContractAlignment({
    snapshot: input.snapshot,
    contract: data,
  });

  return {
    data,
    alignment,
    pendencias: collectPendencias(data, alignment),
  };
}

function collectPendencias(
  data: CanonicalContractBuildResult["data"],
  alignment: CanonicalContractBuildResult["alignment"],
): ContractEnginePendencia[] {
  const unresolved = listUnresolvedPlaceholders(data);
  const forbidden = listForbiddenDraftTokens(data);
  const object = data.contractObject;
  return [
    {
      code: "parties",
      label: "Dados do cliente",
      ok: data.contractingParties.some((p) => p.razaoSocial.trim() && p.documento.trim()),
    },
    {
      code: "scopes",
      label: "Escopos",
      ok: data.scopes.length > 0,
    },
    {
      code: "profiles",
      label: "Mapeamento contratual",
      ok: data.scopes.length > 0 && data.scopes.every((s) => !s.missingProfile),
    },
    {
      code: "object_coverage",
      label: "Cobertura do objeto",
      ok: object.missingScopeIds.length === 0,
    },
    {
      code: "object_fields",
      label: "Campos do objeto",
      ok: object.missingRequiredFields.length === 0,
    },
    {
      code: "investment",
      label: "Investimento",
      ok: data.investment.totalAmount != null && data.investment.totalAmount > 0,
    },
    {
      code: "term",
      label: "Vigência",
      ok: data.term.kind !== "manual" || Boolean(data.term.estimateLabel),
    },
    {
      code: "due_date",
      label: "Primeiro vencimento",
      ok: Boolean(data.payment.firstDueDate),
    },
    {
      code: "payment_method",
      label: "Forma de pagamento",
      ok: data.payment.method !== "indefinido",
    },
    {
      code: "signers",
      label: "Signatários da firma",
      ok: data.signers.length > 0,
    },
    {
      code: "placeholders",
      label: "Placeholders resolvidos",
      ok: unresolved.length === 0 && forbidden.length === 0,
    },
    {
      code: "alignment",
      label: "Alinhamento proposta × contrato",
      ok: alignment.ok,
    },
  ];
}
