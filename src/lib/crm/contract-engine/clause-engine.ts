import {
  getClauseTemplate,
  listRequiredStandardClauses,
} from "./clause-catalog";
import { applyPartyPlaceholders, type PartyGrammar } from "./party-language";
import { renderStartText, renderTermText } from "./term";
import type {
  CanonicalContractObject,
  ClauseOrigin,
  ContractClauseTemplate,
  ContractPayment,
  ContractScope,
  NumberedContractSection,
  ResolvedContractClause,
} from "./types";

export function filterConflictingClauses(
  clauses: ContractClauseTemplate[],
  selectedSubtypeIds: Set<string>,
): ContractClauseTemplate[] {
  return clauses.filter(
    (clause) => !clause.conflictsWithSubtypeIds.some((id) => selectedSubtypeIds.has(id)),
  );
}

export function resolveContractClauses(params: {
  scopes: ContractScope[];
  payment: ContractPayment;
  grammar: PartyGrammar;
  vigenciaTexto: string;
  inicioTexto: string;
  tributacao: string;
  firmPlaceholders: Record<string, string>;
  contractObject?: CanonicalContractObject;
  /** Biblioteca carregada do banco (admin de cláusulas); cai no catálogo fixo quando ausente. */
  clauseLibrary?: Map<string, ContractClauseTemplate>;
}): { clauses: ResolvedContractClause[]; sections: NumberedContractSection[] } {
  const selected = new Set(
    params.scopes.filter((s) => !s.missingProfile).map((s) => s.subtypeId),
  );
  const collected: ResolvedContractClause[] = [];
  const seen = new Set<string>();

  const resolveTemplate = (key: string): ContractClauseTemplate | undefined =>
    params.clauseLibrary?.get(key) ?? getClauseTemplate(key);

  const push = (
    template: ContractClauseTemplate | undefined,
    origin: ClauseOrigin,
    sourceLabel: string,
    profileSubtypeId?: string,
  ) => {
    if (!template) return;
    if (seen.has(template.stableKey)) return;
    if (template.conflictsWithSubtypeIds.some((id) => selected.has(id))) return;
    seen.add(template.stableKey);
    collected.push({
      stableKey: template.stableKey,
      title: template.title,
      content: fillPlaceholders(template.content, {
        grammar: params.grammar,
        vigenciaTexto: params.vigenciaTexto,
        inicioTexto: params.inicioTexto,
        tributacao: params.tributacao,
        firm: params.firmPlaceholders,
      }),
      role: template.role,
      origin,
      sourceLabel,
      version: template.version,
      status: template.status,
      profileSubtypeId,
      placeholdersUsed: template.placeholders,
    });
  };

  if (params.contractObject && params.contractObject.blocks.length > 0) {
    for (const line of params.contractObject.numberedLines) {
      const role =
        line.kind === "limitation"
          ? "limitation"
          : line.kind === "subscope"
            ? "scope"
            : "object";
      const key = `${line.stableKey}:${line.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push({
        stableKey: line.stableKey,
        title: line.title ? `${line.number}. ${line.title}` : line.number,
        content: line.content,
        role,
        origin: "profile",
        sourceLabel: line.sourceLabel,
        version: line.version,
        status: "pending_legal_review",
        placeholdersUsed: [],
      });
    }
  } else {
    for (const scope of params.scopes) {
      if (!scope.profile) continue;
      const label = scope.profile.label.toUpperCase();
      for (const key of scope.profile.objectClauseKeys) {
        push(resolveTemplate(key), "profile", label, scope.subtypeId);
      }
      for (const key of scope.profile.scopeClauseKeys) {
        push(resolveTemplate(key), "profile", label, scope.subtypeId);
      }
      for (const key of scope.profile.limitationClauseKeys) {
        push(resolveTemplate(key), "profile", label, scope.subtypeId);
      }
      for (const key of scope.profile.natureClauseKeys) {
        push(resolveTemplate(key), "profile", label, scope.subtypeId);
      }
    }
  }

  push(resolveTemplate("exclusion_geral_base"), "standard", "PADRÃO BP");
  for (const scope of params.scopes) {
    if (!scope.profile) continue;
    for (const key of scope.profile.exclusionClauseKeys) {
      push(resolveTemplate(key), "profile", scope.profile.label.toUpperCase(), scope.subtypeId);
    }
  }
  push(resolveTemplate("exclusion_scope_change"), "standard", "PADRÃO BP");

  collected.push({
    stableKey: "payment_engine",
    title: "Honorários Contratuais",
    content: params.payment.clauseText,
    role: "payment",
    origin: "payment_engine",
    sourceLabel: "PROPOSTA",
    version: 1,
    status: "pending_legal_review",
    placeholdersUsed: ["[VALOR_TOTAL]", "[VALOR_TOTAL_EXTENSO]"],
  });
  if (params.payment.method === "boleto" || params.payment.method === "combinado") {
    push(resolveTemplate("payment_boleto"), "standard", "PAGAMENTO");
  }
  if (params.payment.method === "transferencia" || params.payment.method === "combinado") {
    push(resolveTemplate("payment_conta"), "standard", "PAGAMENTO");
  }
  if (params.payment.method === "pix" || params.payment.method === "combinado") {
    push(resolveTemplate("payment_pix"), "standard", "PAGAMENTO");
  }

  for (const required of listRequiredStandardClauses()) {
    if (
      required.role === "exclusion" ||
      required.role === "payment" ||
      required.stableKey.startsWith("payment_")
    ) {
      continue;
    }
    push(resolveTemplate(required.stableKey), "standard", "PADRÃO BP");
  }

  return { clauses: collected, sections: numberSections(collected) };
}

function fillPlaceholders(
  content: string,
  ctx: {
    grammar: PartyGrammar;
    vigenciaTexto: string;
    inicioTexto: string;
    tributacao: string;
    firm: Record<string, string>;
  },
): string {
  let text = applyPartyPlaceholders(content, ctx.grammar);
  const map: Record<string, string> = {
    "[VIGENCIA_TEXTO]": ctx.vigenciaTexto,
    "[INICIO_TEXTO]": ctx.inicioTexto,
    "[TRIBUTACAO]": ctx.tributacao || "conforme proposta",
    ...ctx.firm,
  };
  for (const [token, value] of Object.entries(map)) {
    text = text.replaceAll(token, value);
  }
  return text;
}

const SECTION_ORDER: Array<{ title: string; roles: ResolvedContractClause["role"][] }> = [
  { title: "OBJETO DO CONTRATO", roles: ["object", "scope", "limitation", "nature"] },
  { title: "OBJETOS EXCLUÍDOS DO CONTRATO", roles: ["exclusion"] },
  { title: "PREÇO E FORMA DE PAGAMENTO", roles: ["payment", "special"] },
  { title: "INADIMPLEMENTO", roles: ["default"] },
  { title: "VIGÊNCIA", roles: ["term"] },
  { title: "EXTINÇÃO DO CONTRATO", roles: ["termination"] },
  { title: "OBRIGAÇÕES DA CONTRATADA", roles: ["contracted_obligation"] },
  { title: "OBRIGAÇÕES DA CONTRATANTE", roles: ["contracting_obligation"] },
  { title: "DESPESAS", roles: ["expense"] },
  { title: "COMPLIANCE E LEI ANTICORRUPÇÃO", roles: ["compliance"] },
  { title: "DISPOSIÇÕES GERAIS", roles: ["general"] },
];

export function numberSections(clauses: ResolvedContractClause[]): NumberedContractSection[] {
  const sections: NumberedContractSection[] = [];
  let n = 0;
  for (const spec of SECTION_ORDER) {
    const items = clauses.filter((c) => spec.roles.includes(c.role));
    if (items.length === 0) continue;
    n += 1;
    sections.push({
      number: String(n),
      title: spec.title,
      clauses: items.map((clause, index) => ({
        ...clause,
        title: `${n}.${index + 1}. ${clause.title}`,
      })),
    });
  }
  return sections;
}

export { renderStartText, renderTermText };
