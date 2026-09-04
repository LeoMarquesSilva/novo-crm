import type { ContractStartRule, ContractTermRule } from "./types";

export function renderTermText(rule: ContractTermRule): string {
  switch (rule.kind) {
    case "fixed_months":
      return `O presente Contrato terá vigência de ${rule.months ?? 12} (${extensoMeses(rule.months ?? 12)}) meses, podendo ser renovado mediante aditivo contratual.`;
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

export function mergeTermRules(rules: ContractTermRule[]): ContractTermRule {
  if (rules.length === 0) return { kind: "manual" };
  if (rules.length === 1) return rules[0];
  const kinds = new Set(rules.map((r) => r.kind));
  if (kinds.size === 1) return rules[0];
  return {
    kind: "manual",
    estimateLabel:
      "Vigências distintas por escopo — REQUIRES LEGAL DECISION para consolidar um único prazo.",
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
    6: "seis",
    12: "doze",
  };
  return map[n] ?? String(n);
}
