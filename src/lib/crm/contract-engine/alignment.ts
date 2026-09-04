import { extractProposalScopes } from "./proposal-snapshot";
import type { ProposalContractSnapshot } from "./proposal-snapshot";
import type { CanonicalContractData, ProposalContractAlignment } from "./types";

export function validateProposalContractAlignment(params: {
  snapshot: ProposalContractSnapshot;
  contract: CanonicalContractData;
}): ProposalContractAlignment {
  const blockers: ProposalContractAlignment["blockers"] = [];
  const warnings: ProposalContractAlignment["warnings"] = [];
  const proposalScopes = extractProposalScopes(params.snapshot.escopoJson);
  const contractIds = new Set(params.contract.scopes.map((s) => s.subtypeId));
  const proposalIds = new Set(proposalScopes.map((s) => s.subtypeId));

  for (const scope of proposalScopes) {
    if (!contractIds.has(scope.subtypeId)) {
      blockers.push({
        code: "missing_scope",
        message: `O escopo "${scope.label}" da proposta não está representado no contrato.`,
      });
    }
  }

  for (const scope of params.contract.scopes) {
    if (scope.missingProfile) {
      blockers.push({
        code: "missing_profile",
        message: `O escopo "${scope.label}" ainda não possui cláusulas contratuais configuradas. Solicite configuração ao administrador/Societário.`,
      });
    }
    if (!proposalIds.has(scope.subtypeId)) {
      blockers.push({
        code: "extra_scope",
        message: `O contrato contém o escopo "${scope.label}", que não está na proposta.`,
      });
    }
  }

  const coverageMissing = params.contract.contractObject?.missingScopeIds ?? [];
  if (coverageMissing.length > 0) {
    for (const entryId of coverageMissing) {
      const scope = params.contract.scopes.find((s) => s.entryId === entryId);
      blockers.push({
        code: "object_coverage",
        message: scope
          ? `O escopo "${scope.label}" ainda não possui redação contratual configurada.`
          : "Há escopos sem correspondência no Objeto do Contrato.",
      });
    }
  }

  const objectText = [
    ...params.contract.clauses
      .filter((c) => c.role === "object" || c.role === "scope")
      .map((c) => c.content),
    ...(params.contract.contractObject?.blocks ?? []).map((b) => `${b.title ?? ""} ${b.content}`),
  ]
    .join("\n")
    .toLowerCase();
  for (const scope of params.contract.scopes.filter((s) => !s.missingProfile)) {
    const needle = scope.label.toLowerCase().split(" ")[0] ?? "";
    if (needle && !objectText.includes(needle.slice(0, 8))) {
      warnings.push({
        code: "object_wording",
        message: `O objeto/escopo pode não mencionar claramente "${scope.label}".`,
      });
    }
  }

  const exclusionText = params.contract.clauses
    .filter((c) => c.role === "exclusion")
    .map((c) => `${c.stableKey} ${c.content}`)
    .join("\n")
    .toLowerCase();
  for (const scope of params.contract.scopes) {
    if (scope.missingProfile) continue;
    const conflictKey = `exclusion_trabalhista_${guessExclusionToken(scope.subtypeId)}`;
    if (params.contract.clauses.some((c) => c.stableKey === conflictKey)) {
      blockers.push({
        code: "contradictory_exclusion",
        message: `Uma cláusula de exclusão contradiz o escopo contratado "${scope.label}".`,
      });
    }
    if (
      scope.subtypeId.includes("auditoria") &&
      /não está incluída a realização de auditoria/.test(exclusionText)
    ) {
      blockers.push({
        code: "contradictory_exclusion",
        message: `O contrato exclui Auditoria Trabalhista embora ela tenha sido contratada.`,
      });
    }
    if (
      scope.subtypeId.includes("diagnostico") &&
      /não está incluído o mapeamento para diagnóstico/.test(exclusionText)
    ) {
      blockers.push({
        code: "contradictory_exclusion",
        message: `O contrato exclui Diagnóstico NR-1 embora ele tenha sido contratado.`,
      });
    }
  }

  if (params.contract.investment.totalAmount == null) {
    warnings.push({
      code: "investment_missing",
      message: "O investimento estruturado da proposta não pôde ser resolvido.",
    });
  }
  if (!params.contract.payment.arithmeticOk) {
    blockers.push({
      code: "investment_arithmetic",
      message: params.contract.payment.arithmeticNote ?? "Investimento inconsistente.",
    });
  }
  if (!params.contract.payment.firstDueDate) {
    warnings.push({
      code: "due_date_contract_only",
      message: "Primeiro vencimento definido somente no contrato, ou ainda pendente.",
    });
  }
  if (params.contract.term.kind === "manual") {
    warnings.push({
      code: "manual_term",
      message: "A vigência foi consolidada manualmente porque os escopos têm regras distintas.",
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

function guessExclusionToken(subtypeId: string): string {
  if (subtypeId.includes("auditoria")) return "auditoria";
  if (subtypeId.includes("diagnostico")) return "diagnostico";
  if (subtypeId.includes("canal")) return "canal";
  if (subtypeId.includes("consultivo")) return "consultivo";
  if (subtypeId.includes("contencioso")) return "contencioso";
  return subtypeId;
}
