import type { OpportunityStage } from "./entities";

/**
 * Quem move o lead entre duas etapas, e por qual caminho.
 *
 * - `manual`: arrastar no kanban / botão "Avançar" (POST /api/crm/leads/transition).
 * - `send_dialog`: envio do contrato para assinatura (D4Sign).
 * - `system`: assinatura concluída na D4Sign (webhook/sync).
 * - `onboarding_submit` / `onboarding_return` / `onboarding_conclude`: cadastro do cliente.
 * - `onboarding_billing`: dados do faturamento enviados pelo responsável (cadastro já concluído).
 * - `contract_activation`: ativação do contrato no gerenciamento de contratos.
 * - `contract_review`: conclusão da revisão do contrato.
 */
export type StageTransitionChannel =
  | "manual"
  | "send_dialog"
  | "system"
  | "onboarding_submit"
  | "onboarding_return"
  | "onboarding_conclude"
  | "onboarding_billing"
  | "contract_activation"
  | "contract_review";

/** Ação da tela que substitui o arrasto quando a etapa tem caminho próprio. */
export type StageActionKind =
  | "open_send_dialog"
  | "open_onboarding"
  | "open_ops_panel"
  | "open_billing"
  | "open_contract_setup";

export type StageTransitionRole = "admin" | "comercial" | "controladoria" | "financeiro";

/** Time liberado em Configurações → Usuários (`app_user_module_access`). */
export type StageTransitionTeam = "operacoes_legais";

export type StageTransitionPrincipal =
  | StageTransitionRole
  | "lead_owner"
  | { team: StageTransitionTeam };

export type StageTransitionActor = {
  role: StageTransitionRole;
  teams: readonly string[];
  isLeadOwner: boolean;
};

export type StageTransitionRule = {
  from: OpportunityStage;
  to: OpportunityStage;
  channels: readonly StageTransitionChannel[];
  allow: readonly StageTransitionPrincipal[];
  /** Admin pode usar o caminho manual mesmo quando a etapa tem caminho próprio. */
  adminManualOverride?: boolean;
  actionKind?: StageActionKind;
};

const OPS: StageTransitionPrincipal = { team: "operacoes_legais" };

export const STAGE_TRANSITION_RULES: readonly StageTransitionRule[] = [
  {
    from: "confeccao_contrato",
    to: "contrato_elaborado",
    channels: ["manual", "contract_review"],
    allow: ["admin", "comercial"],
  },
  {
    from: "contrato_elaborado",
    to: "contrato_enviado",
    channels: ["send_dialog"],
    allow: ["admin", "comercial"],
    actionKind: "open_send_dialog",
  },
  { from: "contrato_enviado", to: "contrato_elaborado", channels: ["manual"], allow: ["admin"] },
  {
    from: "contrato_enviado",
    to: "contrato_assinado",
    channels: ["system"],
    allow: ["admin"],
    adminManualOverride: true,
  },
  {
    from: "contrato_assinado",
    to: "aguardando_cadastro",
    channels: ["system"],
    allow: ["admin"],
    adminManualOverride: true,
  },
  { from: "aguardando_cadastro", to: "contrato_assinado", channels: ["manual"], allow: ["admin"] },
  {
    from: "aguardando_cadastro",
    to: "cadastro_novo_cliente",
    channels: ["onboarding_submit"],
    allow: ["admin", "comercial", "lead_owner"],
    actionKind: "open_onboarding",
  },
  {
    from: "cadastro_novo_cliente",
    to: "aguardando_cadastro",
    channels: ["onboarding_return"],
    allow: ["admin", OPS],
    actionKind: "open_ops_panel",
  },
  // Operações Legais conclui o cadastro sem mudar a etapa; o responsável avança enviando os
  // dados do faturamento (27/10/2026). `onboarding_conclude` só vale sem a migration
  // 20261027120000, quando a conclusão ainda leva o lead para Inclusão.
  {
    from: "cadastro_novo_cliente",
    to: "inclusao_faturamento",
    channels: ["onboarding_billing"],
    allow: ["admin", "comercial", "lead_owner"],
    actionKind: "open_billing",
  },
  { from: "inclusao_faturamento", to: "cadastro_novo_cliente", channels: ["manual"], allow: ["admin"] },
  {
    from: "inclusao_faturamento",
    to: "boas_vindas",
    channels: ["contract_activation"],
    allow: ["admin", "controladoria", "financeiro"],
    actionKind: "open_contract_setup",
  },
  { from: "boas_vindas", to: "inclusao_faturamento", channels: ["manual"], allow: ["admin"] },
  { from: "boas_vindas", to: "reuniao_kickoff", channels: ["manual"], allow: ["admin", "comercial"] },
  { from: "reuniao_kickoff", to: "boas_vindas", channels: ["manual"], allow: ["admin", "comercial"] },
];

const POST_SALE_STAGES = new Set<OpportunityStage>([
  "aguardando_cadastro",
  "cadastro_novo_cliente",
  "inclusao_faturamento",
  "boas_vindas",
  "reuniao_kickoff",
]);

/** Etapas de venda sem regra própria: admin e comercial, pelo caminho manual. */
const DEFAULT_SALES_RULE = {
  channels: ["manual"],
  allow: ["admin", "comercial"],
} as const satisfies Pick<StageTransitionRule, "channels" | "allow">;

/** Pós-venda sem regra própria: só admin. */
const DEFAULT_POST_SALE_RULE = {
  channels: ["manual"],
  allow: ["admin"],
} as const satisfies Pick<StageTransitionRule, "channels" | "allow">;

export function resolveStageTransitionRule(
  from: OpportunityStage,
  to: OpportunityStage,
): StageTransitionRule {
  const rule = STAGE_TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  if (rule) return rule;
  const base =
    POST_SALE_STAGES.has(from) || POST_SALE_STAGES.has(to)
      ? DEFAULT_POST_SALE_RULE
      : DEFAULT_SALES_RULE;
  return { from, to, ...base };
}

function matchesPrincipal(actor: StageTransitionActor, principal: StageTransitionPrincipal): boolean {
  if (typeof principal === "object") {
    return actor.role === "admin" || actor.teams.includes(principal.team);
  }
  if (principal === "lead_owner") return actor.isLeadOwner;
  return actor.role === principal;
}

export type StageTransitionDecision =
  | { allowed: true; rule: StageTransitionRule }
  | {
      allowed: false;
      code: "forbidden" | "use_dedicated_action";
      reason: string;
      rule: StageTransitionRule;
      actionKind?: StageActionKind;
    };

export function evaluateStageTransition(input: {
  from: OpportunityStage;
  to: OpportunityStage;
  channel: StageTransitionChannel;
  actor: StageTransitionActor;
}): StageTransitionDecision {
  const rule = resolveStageTransitionRule(input.from, input.to);
  const adminOverride =
    input.channel === "manual" && rule.adminManualOverride === true && input.actor.role === "admin";

  if (!adminOverride && !rule.allow.some((p) => matchesPrincipal(input.actor, p))) {
    return {
      allowed: false,
      code: "forbidden",
      reason: "Seu perfil não pode mover o lead entre essas etapas.",
      rule,
    };
  }

  if (!adminOverride && !rule.channels.includes(input.channel)) {
    return {
      allowed: false,
      code: "use_dedicated_action",
      reason: dedicatedActionReason(rule),
      rule,
      ...(rule.actionKind ? { actionKind: rule.actionKind } : {}),
    };
  }

  return { allowed: true, rule };
}

export function canActorUseTransition(input: Parameters<typeof evaluateStageTransition>[0]): boolean {
  return evaluateStageTransition(input).allowed;
}

function dedicatedActionReason(rule: StageTransitionRule): string {
  switch (rule.actionKind) {
    case "open_send_dialog":
      return "Envie o contrato para assinatura: a etapa muda sozinha depois do envio.";
    case "open_onboarding":
      return "Preencha o cadastro do cliente e envie para Operações Legais.";
    case "open_ops_panel":
      return "Use o painel de Operações Legais para devolver ou concluir o cadastro.";
    case "open_billing":
      return "Preencha os dados do faturamento: o lead vai para Inclusão no Faturamento ao enviar.";
    case "open_contract_setup":
      return "Ative o contrato no gerenciamento de contratos: o lead vai para Boas-vindas ao ativar.";
    default:
      return rule.channels.includes("system")
        ? "Essa etapa muda sozinha quando todos assinam na D4Sign."
        : "Essa mudança de etapa tem um caminho próprio.";
  }
}
