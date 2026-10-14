import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import type { Database } from "@/lib/supabase/database.types";
import type { OpportunityStage } from "@/modules/crm/domain/entities";
import {
  evaluateStageTransition,
  type StageActionKind,
  type StageTransitionChannel,
} from "@/modules/crm/domain/stage-transition-rules";

export type CrmRole = Database["public"]["Enums"]["user_role"];

export type ContractCapability =
  | "view"
  | "configure"
  | "prepare_closing"
  | "approve_closing"
  | "register_vios"
  | "manage_renewal"
  | "ensure_draft";

export function canEnsureContractDraft(
  role: Database["public"]["Enums"]["user_role"],
): boolean {
  return role === "admin" || role === "comercial" || role === "controladoria";
}

export function canAccessContractCapability(input: {
  role: Database["public"]["Enums"]["user_role"];
  capability: ContractCapability;
}): boolean {
  switch (input.capability) {
    case "view":
      return (
        input.role === "admin" ||
        input.role === "controladoria" ||
        input.role === "financeiro" ||
        input.role === "comercial"
      );
    case "configure":
    case "approve_closing":
    case "manage_renewal":
      return input.role === "admin" || input.role === "controladoria";
    case "ensure_draft":
      return canEnsureContractDraft(input.role);
    case "prepare_closing":
    case "register_vios":
      return (
        input.role === "admin" ||
        input.role === "controladoria" ||
        input.role === "financeiro"
      );
  }
}

type CanPatchLeadDetailInput = {
  role: Database["public"]["Enums"]["user_role"];
  appArea: string | null;
  mutationKind: "intake" | "rd" | "pipeline";
  pipelineFieldCode: string | null;
};

export function canPatchLeadDetail(input: CanPatchLeadDetailInput): boolean {
  if (input.role === "admin" || input.role === "comercial") {
    return true;
  }

  return (
    input.mutationKind === "pipeline" &&
    input.pipelineFieldCode === "cp_escopo_detalhe_json" &&
    Boolean(input.appArea?.trim())
  );
}

type CanViewD4SignDocumentInput = {
  role: Database["public"]["Enums"]["user_role"];
};

export function canViewD4SignDocument(
  input: CanViewD4SignDocumentInput,
): boolean {
  return (
    input.role === "admin" ||
    input.role === "comercial" ||
    input.role === "controladoria" ||
    input.role === "financeiro"
  );
}

type CanViewD4SignDocumentRecordInput = CanViewD4SignDocumentInput & {
  oportunidadeId: string | null;
  /** Usuário é sócio signatário da firma (área "Assinar Contratos"). */
  isFirmPartner?: boolean;
};

export function canViewD4SignDocumentRecord(
  input: CanViewD4SignDocumentRecordInput,
): boolean {
  if (!canViewD4SignDocument(input)) {
    return false;
  }

  return input.oportunidadeId !== null || input.role === "admin" || input.isFirmPartner === true;
}

/**
 * Módulos liberados por usuário em Configurações → Usuários (tabela
 * app_user_module_access). Novo módulo: incluir aqui e no check da tabela.
 */
export const CRM_MODULES = ["icp", "operacoes_legais"] as const;

export type CrmModule = (typeof CRM_MODULES)[number];

export const CRM_MODULE_LABELS: Record<CrmModule, string> = {
  icp: "ICP (perfil de cliente ideal)",
  operacoes_legais: "Operações Legais (cadastro de novos clientes)",
};

/** Rótulo curto do switch em Configurações → Usuários. */
export const CRM_MODULE_SHORT_LABELS: Record<CrmModule, string> = {
  icp: "ICP",
  operacoes_legais: "Ops Legais",
};

export function isCrmModule(value: string): value is CrmModule {
  return (CRM_MODULES as readonly string[]).includes(value);
}

/** Admin vê todos os módulos; os demais papéis só os liberados no cadastro. */
export function canAccessModule(input: {
  role: Database["public"]["Enums"]["user_role"];
  modules: readonly string[];
  module: CrmModule;
}): boolean {
  return input.role === "admin" || input.modules.includes(input.module);
}

/* ------------------------------------------------------------------------- */
/* Política única de ações do lead (papel + time + dono do lead)             */
/* ------------------------------------------------------------------------- */

export type CrmActor = {
  appUserId: string;
  role: CrmRole;
  area: string | null;
  email: string | null;
  modules: readonly CrmModule[];
};

export type LeadOwnership = {
  createdByAppUserId: string | null;
  /** Captador / solicitante interno (`oportunidades.solicitante_email`). */
  requesterEmail?: string | null;
};

/** Área que revisa os contratos (inclui a grafia antiga sem acento). */
export const CONTRACT_REVIEW_AREA = "Societário e Contratos";
export const CONTRACT_REVIEW_AREA_ALIASES = ["Societário e Contratos", "Societario e Contratos"] as const;

export type LeadActionInput =
  | { action: "lead.create" }
  | { action: "lead.edit"; mutationKind: "intake" | "rd" | "pipeline"; pipelineFieldCode: string | null }
  | { action: "lead.close" }
  | { action: "lead.delete" }
  | {
      action: "stage.advance";
      from: OpportunityStage;
      to: OpportunityStage;
      lead: LeadOwnership;
      channel?: StageTransitionChannel;
    }
  | { action: "proposal.manage" }
  | { action: "contract.edit" }
  | { action: "contract.send" }
  | { action: "contract.review.request" }
  | { action: "contract.review.update"; assignedToAppUserId: string | null }
  | { action: "d4sign.ops" }
  | { action: "d4sign.cancel" };

export type LeadActionName = LeadActionInput["action"];

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string; code: "forbidden" | "use_dedicated_action"; actionKind?: StageActionKind };

const CRM_ROLES = new Set<string>(["admin", "comercial", "controladoria", "financeiro"]);

export function isCrmRole(value: string): value is CrmRole {
  return CRM_ROLES.has(value);
}

export function toCrmActor(input: {
  appUserId: string;
  role: string | null;
  area: string | null;
  email?: string | null;
  modules?: readonly string[];
}): CrmActor | null {
  if (!input.role || !isCrmRole(input.role)) return null;
  return {
    appUserId: input.appUserId,
    role: input.role,
    area: input.area,
    email: input.email?.trim().toLowerCase() || null,
    modules: (input.modules ?? []).filter(isCrmModule),
  };
}

/** Admin conta como membro de todo time. */
export function isTeamMember(actor: Pick<CrmActor, "role" | "modules">, module: CrmModule): boolean {
  return canAccessModule({ role: actor.role, modules: actor.modules, module });
}

export function isContractReviewer(actor: Pick<CrmActor, "area">): boolean {
  if (!actor.area) return false;
  return normalizePracticeAreaKey(actor.area) === CONTRACT_REVIEW_AREA;
}

export function isLeadOwner(actor: Pick<CrmActor, "appUserId" | "email">, lead: LeadOwnership): boolean {
  if (lead.createdByAppUserId && lead.createdByAppUserId === actor.appUserId) return true;
  const requester = lead.requesterEmail?.trim().toLowerCase();
  return Boolean(requester && actor.email && requester === actor.email);
}

const ADMIN_COMERCIAL_ACTIONS = new Set<LeadActionName>([
  "lead.create",
  "lead.close",
  "proposal.manage",
  "contract.edit",
  "contract.send",
  "contract.review.request",
  "d4sign.ops",
]);

const DENIED: PolicyDecision = {
  allowed: false,
  code: "forbidden",
  reason: "Seu perfil não tem permissão para esta ação.",
};

export function evaluateLeadAction(actor: CrmActor, input: LeadActionInput): PolicyDecision {
  if (ADMIN_COMERCIAL_ACTIONS.has(input.action)) {
    return actor.role === "admin" || actor.role === "comercial" ? { allowed: true } : DENIED;
  }

  switch (input.action) {
    case "lead.edit":
      return canPatchLeadDetail({
        role: actor.role,
        appArea: actor.area,
        mutationKind: input.mutationKind,
        pipelineFieldCode: input.pipelineFieldCode,
      })
        ? { allowed: true }
        : DENIED;
    case "lead.delete":
    case "d4sign.cancel":
      return actor.role === "admin" ? { allowed: true } : DENIED;
    case "contract.review.update": {
      const allowed =
        actor.role === "admin" ||
        actor.role === "comercial" ||
        isContractReviewer(actor) ||
        (input.assignedToAppUserId !== null && input.assignedToAppUserId === actor.appUserId);
      return allowed ? { allowed: true } : DENIED;
    }
    case "stage.advance": {
      const decision = evaluateStageTransition({
        from: input.from,
        to: input.to,
        channel: input.channel ?? "manual",
        actor: {
          role: actor.role,
          teams: actor.modules,
          isLeadOwner: isLeadOwner(actor, input.lead),
        },
      });
      if (decision.allowed) return { allowed: true };
      return {
        allowed: false,
        code: decision.code,
        reason: decision.reason,
        ...(decision.actionKind ? { actionKind: decision.actionKind } : {}),
      };
    }
    default:
      return DENIED;
  }
}

export function canPerformLeadAction(actor: CrmActor, input: LeadActionInput): boolean {
  return evaluateLeadAction(actor, input).allowed;
}
