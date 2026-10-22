import type { OpportunityStage } from "@/modules/crm/domain/entities";

import { isValidCpfOrCnpj } from "./documents";
import { normalizeRdLabel } from "./rd-deal";
import { stageIndex } from "./scope";

/**
 * O mesmo cliente aparece mais de uma vez na fila quando o RD tem um negócio no funil de
 * vendas e outro no pós-venda (ou dois negócios abertos). Converter os dois criaria dois
 * leads do CRM para o mesmo cliente: a fila marca o grupo e o admin escolhe qual migra.
 */

export type RdDuplicateCandidate = {
  opportunityId: string;
  nome: string;
  /** CPF/CNPJ das empresas/pessoas do lead (só dígitos). */
  documentos: string[];
  /** Etapa onde o negócio cai no CRM (ou a atual, se já convertido). */
  stage: OpportunityStage | null;
  /** Já convertido na virada. */
  converted: boolean;
};

export type RdDuplicateInfo = {
  /** Outros negócios do mesmo cliente que ainda estão na migração. */
  others: string[];
  /** Este é o sugerido para migrar: já convertido ou na etapa mais adiantada. */
  suggested: boolean;
  /** O que liga os negócios ("CPF/CNPJ" ou "nome"). */
  reason: "documento" | "nome";
};

const COMPANY_SUFFIXES = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "ss", "slu", "cia"]);

/** Nome comparável: sem acento, caixa, pontuação nem sufixo societário ("ACME Ltda." → "acme"). */
export function comparableClientName(nome: string): string {
  return normalizeRdLabel(nome)
    .split(" ")
    .filter((t) => t && !COMPANY_SUFFIXES.has(t))
    .join(" ");
}

function rank(c: RdDuplicateCandidate): number {
  return (c.converted ? 1000 : 0) + (c.stage ? stageIndex(c.stage) : -1);
}

export function findRdMigrationDuplicates(candidates: RdDuplicateCandidate[]): Map<string, RdDuplicateInfo> {
  const parent = new Map<string, string>(candidates.map((c) => [c.opportunityId, c.opportunityId]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const link = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const validDocs = (c: RdDuplicateCandidate) => c.documentos.filter(isValidCpfOrCnpj);
  const firstByKey = new Map<string, string>();
  for (const c of candidates) {
    const keys = validDocs(c).map((doc) => `doc:${doc}`);
    const name = comparableClientName(c.nome);
    if (name.length >= 4) keys.push(`nome:${name}`);
    for (const key of keys) {
      const seen = firstByKey.get(key);
      if (seen) link(seen, c.opportunityId);
      else firstByKey.set(key, c.opportunityId);
    }
  }

  const groups = new Map<string, RdDuplicateCandidate[]>();
  for (const c of candidates) {
    const root = find(c.opportunityId);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  }

  const out = new Map<string, RdDuplicateInfo>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const best = [...members].sort((a, b) => rank(b) - rank(a))[0];
    const docCount = new Map<string, number>();
    for (const m of members) for (const doc of new Set(validDocs(m))) docCount.set(doc, (docCount.get(doc) ?? 0) + 1);
    const reason = [...docCount.values()].some((n) => n > 1) ? "documento" : "nome";
    for (const m of members) {
      out.set(m.opportunityId, {
        others: members.filter((o) => o.opportunityId !== m.opportunityId).map((o) => o.opportunityId),
        suggested: m.opportunityId === best.opportunityId,
        reason,
      });
    }
  }
  return out;
}
