import type { ContractStartRule, ContractTermRule } from "./types";

export function renderTermText(rule: ContractTermRule): string {
  switch (rule.kind) {
    case "fixed_months":
      // Padrão desde 03/11/2026: 12 meses contados da assinatura (antes, prazo indeterminado).
      return `O presente Contrato terá vigência de ${rule.months ?? 12} (${extensoMeses(rule.months ?? 12)}) meses, contados da data de sua assinatura, podendo ser renovado mediante aditivo contratual.`;
    case "fixed_days":
      return `O presente Contrato terá vigência de ${rule.days ?? 30} dias.`;
    case "until_deliverable":
      return `O presente Contrato terá vigência até a entrega, pela Contratada, do ${rule.deliverable ?? "entregável contratado"}.`;
    case "until_deliverable_with_estimate": {
      const estimate = rule.estimateLabel
        ? ` Prazo máximo/estimado: ${rule.estimateLabel}.`
        : rule.months
          ? ` Duração estimada de ${rule.months} meses.`
          : rule.days
            ? ` Prazo máximo de ${rule.days} dias.`
            : "";
      return `O presente Contrato terá vigência até a entrega, pela Contratada, do ${rule.deliverable ?? "entregável contratado"}.${estimate}`;
    }
    case "indefinite":
      return "O presente Contrato é celebrado por prazo indeterminado.";
    case "manual":
      return rule.estimateLabel?.trim() || "A vigência será a definida nas condições contratuais.";
    default:
      return "A vigência depende de definição contratual.";
  }
}

/** Rótulo curto da vigência para a tela (o texto do contrato é `renderTermText`). */
export function describeTermRule(rule: ContractTermRule): string {
  const deliverable = rule.deliverable?.trim() || "entregável contratado";
  switch (rule.kind) {
    case "fixed_months": {
      const months = rule.months ?? 12;
      return `${months} ${months === 1 ? "mês" : "meses"}`;
    }
    case "fixed_days": {
      const days = rule.days ?? 30;
      return `${days} ${days === 1 ? "dia" : "dias"}`;
    }
    case "until_deliverable":
      return `Até a entrega: ${deliverable}`;
    case "until_deliverable_with_estimate": {
      const estimate =
        rule.estimateLabel?.trim() ||
        (rule.months ? `${rule.months} meses` : rule.days ? `${rule.days} dias` : "");
      return estimate ? `Até a entrega: ${deliverable} (estimativa: ${estimate})` : `Até a entrega: ${deliverable}`;
    }
    case "indefinite":
      return "Prazo indeterminado";
    case "manual":
      return rule.estimateLabel?.trim() || "Definida nas condições contratuais";
    default:
      return "A definir";
  }
}

export function renderStartText(rule: ContractStartRule): string {
  switch (rule.kind) {
    case "on_signature":
      return "A prestação dos serviços se iniciará na ocasião da assinatura do Contrato.";
    case "on_first_payment":
      return "A prestação dos serviços se iniciará na ocasião do primeiro pagamento.";
    case "on_defined_date":
      return rule.date
        ? `A prestação dos serviços se iniciará em ${rule.date}.`
        : "A data de início dos serviços ainda não foi definida.";
    default:
      return "O início dos serviços depende de definição contratual.";
  }
}

/** Prazo de um escopo como trecho de frase, para a cláusula com vigências distintas. */
function termPhrase(rule: ContractTermRule): string {
  const deliverable = rule.deliverable?.trim() || "entregável contratado";
  switch (rule.kind) {
    case "fixed_months": {
      const months = rule.months ?? 12;
      return `${months} (${extensoMeses(months)}) ${months === 1 ? "mês" : "meses"}, contados da data de assinatura do Contrato`;
    }
    case "fixed_days": {
      const days = rule.days ?? 30;
      return `${days} ${days === 1 ? "dia" : "dias"}`;
    }
    case "until_deliverable":
      return `até a entrega, pela Contratada, do ${deliverable}`;
    case "until_deliverable_with_estimate": {
      const estimate =
        rule.estimateLabel?.trim() || (rule.months ? `${rule.months} meses` : rule.days ? `${rule.days} dias` : "");
      return `até a entrega, pela Contratada, do ${deliverable}${estimate ? `, com prazo estimado de ${estimate}` : ""}`;
    }
    case "indefinite":
      return "prazo indeterminado";
    case "manual":
      return rule.estimateLabel?.trim() || "a definida nas condições contratuais";
    default:
      return "a definida nas condições contratuais";
  }
}

const ROMANOS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/**
 * Vigência do contrato a partir da vigência de cada escopo. Escopos com o mesmo prazo dão o próprio prazo;
 * prazos diferentes viram uma cláusula com o prazo de cada escopo. Antes, prazos diferentes saíam no
 * contrato como "Vigências distintas por escopo — REQUIRES LEGAL DECISION…" (nota interna; teste de
 * 16/11/2026 com Contencioso Cível + Auditoria Trabalhista).
 */
export function mergeTermRules(
  rules: ContractTermRule[],
  scopeLabels?: string[],
): ContractTermRule {
  if (rules.length === 0) return { kind: "manual" };
  if (rules.length === 1) return rules[0];
  const grupos = new Map<string, { rule: ContractTermRule; labels: string[] }>();
  rules.forEach((rule, i) => {
    const chave = JSON.stringify([rule.kind, rule.months ?? null, rule.days ?? null, rule.deliverable ?? null, rule.estimateLabel ?? null]);
    const grupo = grupos.get(chave) ?? { rule, labels: [] };
    const label = scopeLabels?.[i]?.trim();
    if (label && !grupo.labels.includes(label)) grupo.labels.push(label);
    grupos.set(chave, grupo);
  });
  if (grupos.size === 1) return rules[0];
  const partes = [...grupos.values()].map((g, i) => {
    const quem = g.labels.length ? g.labels.join(" e ") : `escopo ${i + 1}`;
    return `(${ROMANOS[i] ?? i + 1}) ${quem}: ${termPhrase(g.rule)}`;
  });
  return {
    kind: "manual",
    estimateLabel: `A vigência do presente Contrato observa o prazo de cada escopo contratado: ${partes.join("; ")}.`,
  };
}

export function mergeStartRules(rules: ContractStartRule[]): ContractStartRule {
  if (rules.length === 0) return { kind: "on_signature" };
  if (rules.length === 1) return rules[0];
  const kinds = new Set(rules.map((r) => r.kind));
  if (kinds.size === 1) return rules[0];
  return { kind: "on_signature" };
}

function extensoMeses(n: number): string {
  const map: Record<number, string> = {
    1: "um",
    2: "dois",
    3: "três",
    4: "quatro",
    5: "cinco",
    6: "seis",
    7: "sete",
    8: "oito",
    9: "nove",
    10: "dez",
    11: "onze",
    12: "doze",
    18: "dezoito",
    24: "vinte e quatro",
    36: "trinta e seis",
  };
  return map[n] ?? String(n);
}
